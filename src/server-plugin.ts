// Server Plugin - Background Task Panel
// Uses the Hooks pattern to receive events from OpenCode

import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import { loadTasks, persist, getTask, setTask, getAllTasks, DATA_DIR, DB_FILE } from "./repo/Database.js"
import { readFileSync, existsSync, writeFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { homedir } from "os"

// Derive config path relative to user config directory
// Uses ~/.config/opencode/ for portability across platforms
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const CONFIG_FILE = join(homedir(), ".config", "opencode", "background-panel.jsonc")

// Log level: DEBUG > INFO > ERROR
type LogLevel = "DEBUG" | "INFO" | "ERROR"
let logLevel: LogLevel = "ERROR"

function btpLog(level: LogLevel, ...args: any[]): void {
  const levels: LogLevel[] = ["DEBUG", "INFO", "ERROR"]
  const current = levels.indexOf(logLevel)
  const message = levels.indexOf(level)
  if (message >= current) {
    console.log("[BTP] [" + level + "]", ...args)
  }
}

// Skip task patterns
let skipTaskPatterns: RegExp[] = []

// Load config (synchronous)
function loadConfig(): void {
  try {
    if (!existsSync(CONFIG_FILE)) {
      btpLog("INFO", "Config file not found, creating default at", CONFIG_FILE)
      const defaultConfig = `{
// Log level: DEBUG, INFO, or ERROR (default: ERROR)
"log_level": "ERROR",

// Skip task patterns - titles matching these regex patterns will be skipped
// Examples:
//   "magic-context-compartment" - skip magic context compartments
//   "^test" - skip tasks starting with "test"
//   ".*ignore.*" - skip tasks containing "ignore"
"skip_tasks": [],

// Data directory - managed by the plugin, do not edit
"data_dir": "${DATA_DIR.replace(/\\/g, "\\\\")}",
"db_file": "${DB_FILE.replace(/\\/g, "\\\\")}"
}
`
      try {
        writeFileSync(CONFIG_FILE, defaultConfig, "utf-8")
      } catch (e) {
        btpLog("ERROR", "Failed to create config file:", e)
      }
      skipTaskPatterns = []
      return
    }

    const content = readFileSync(CONFIG_FILE, "utf-8")
    // Simple JSON parsing (remove comments)
    const cleanContent = content
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")

    const config = JSON.parse(cleanContent)
    logLevel = (config.log_level as LogLevel) || "ERROR"
    const patterns: string[] = config.skip_tasks || []

    skipTaskPatterns = patterns.map(p => new RegExp(p))
    btpLog("INFO", "Loaded config, log level:", logLevel, ", skip patterns:", patterns)

    // Ensure data_dir is in config (for TUI to read)
    if (!config.data_dir || config.data_dir !== DATA_DIR) {
      try {
        const updatedConfig = { ...config, data_dir: DATA_DIR, db_file: DB_FILE }
        const newContent = JSON.stringify(updatedConfig, null, 2)
        writeFileSync(CONFIG_FILE, newContent, "utf-8")
        btpLog("INFO", "Updated config with data_dir:", DATA_DIR)
      } catch (e) {
        btpLog("ERROR", "Failed to update config with data_dir:", e)
      }
    }
  } catch (e) {
    btpLog("ERROR", "Config load error:", e)
    skipTaskPatterns = []
  }
}

// Check if title should be skipped
function shouldSkipTask(title: string): boolean {
  for (const pattern of skipTaskPatterns) {
    if (pattern.test(title)) {
      return true
    }
  }
  return false
}

// Load config on startup
loadConfig()

btpLog("INFO", "Server plugin module loaded")

// Task interface - re-exported from Database
interface Task {
  id: string
  sessionId: string
  type: "session_create" | "session_complete" | "error"
  title: string
  status: "running" | "pending" | "completed" | "failed"
  createdAt: number
  updatedAt: number
  pid?: number  // Server process PID when task was created
}

// Store client for API calls
let pluginClient: any = null

function isSubagentSession(event: any): boolean {
  // A subagent session is one that has a parentID - it was created by another session
  const parentID = event.properties?.info?.parentID
  return !!parentID
}

// Check session status via OpenCode API
async function checkSessionStatus(sessionId: string): Promise<{ status: string; type: string } | null> {
  if (!pluginClient) return null

  try {
    // Use session.status to get current status
    const result = await pluginClient.session.status({ directory: process.cwd() })
    // Find our session in the results
    const sessions = result as any[]
    const session = sessions?.find((s: any) => s.sessionID === sessionId || s.id === sessionId)
    if (session) {
      return { status: session.status, type: session.type }
    }
  } catch (e) {
    btpLog("ERROR", "Failed to check session status:", e)
  }
  return null
}

// Refresh running tasks by checking their actual session status via API
async function refreshRunningTasks(): Promise<void> {
  const tasks = getAllTasks()
  const runningTasks = tasks.filter(t => t.status === "running")

  if (runningTasks.length === 0) {
    btpLog("INFO", "No running tasks to refresh")
    return
  }

  btpLog("DEBUG", "Refreshing", runningTasks.length, "running tasks via session.status() API...")

  // Call session.status() to get all active session statuses
  const timeoutMs = 5000
  let statusResult: any = null

  try {
    statusResult = await Promise.race([
      pluginClient.session.status(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs))
    ])
  } catch (e: any) {
    btpLog("ERROR", "Session status API error:", e.message)
    return
  }

  // Parse result - curl test shows: { "sessionId": { type: "busy" } }
  // SDK wraps it in { data: { "200": { sessionId: { type } } } }
  const statusData = statusResult?.data?.["200"] || {}
  const activeSessionIds = Object.keys(statusData)
  btpLog("DEBUG", "Active sessions:", activeSessionIds)

  for (const task of runningTasks) {
    btpLog("DEBUG", "Checking task:", task.sessionId, task.title)

    // If sessionId is NOT in active sessions, it has failed (not completed)
    if (!activeSessionIds.includes(task.sessionId)) {
      btpLog("DEBUG", "Session not in active list -> marking as FAILED:", task.sessionId)
      task.status = "failed"
      task.updatedAt = Date.now()
      setTask(task)
      continue
    }

    // Session is active - check its status
    const sessionStatus = statusData[task.sessionId]
    if (sessionStatus) {
      btpLog("DEBUG", "Session status:", task.sessionId, sessionStatus.type)

      if (sessionStatus.type === "idle") {
        task.status = "completed"
        task.updatedAt = Date.now()
        setTask(task)
        btpLog("DEBUG", "Task marked completed:", task.title)
      } else if (sessionStatus.type === "retry" && sessionStatus.attempt >= 3) {
        task.status = "failed"
        task.updatedAt = Date.now()
        setTask(task)
        btpLog("DEBUG", "Task marked failed (retry):", task.title)
      }
      // "busy" sessions remain running
    }
  }
}

async function handleEvent(event: any) {
  const { type, properties = {} } = event

  btpLog("INFO", "Event received:", type, "sessionID:", properties.sessionID)

  if (type === "session.created") {
    const sessionId = properties.sessionID || properties.info?.id
    const title = properties.info?.title
    const parentID = properties.info?.parentID

    btpLog("DEBUG", "=== SESSION.CREATED DEBUG ===")
    btpLog("DEBUG", "Full event properties:", JSON.stringify(properties, null, 2))
    btpLog("DEBUG", "sessionId:", sessionId)
    btpLog("DEBUG", "title:", title)
    btpLog("DEBUG", "parentID:", parentID)
    btpLog("DEBUG", "==================================")

    // Filter out tasks matching skip patterns
    if (shouldSkipTask(title)) {
      btpLog("DEBUG", "Skipping task (matched skip pattern):", title)
      return
    }

    if (!sessionId) {
      btpLog("ERROR", "No sessionId in session.created event")
      return
    }

    if (!parentID) {
      btpLog("DEBUG", "NOT creating task - no parentID. Title:", title)
      return
    }

    btpLog("INFO", "Creating task for subagent session...")

    const task: Task = {
      id: sessionId,
      sessionId: sessionId,
      parentSessionId: parentID,
      type: "session_create",
      title: title || "Unknown Task",
      status: "running",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pid: process.pid
    }

    setTask(task)
    btpLog("INFO", "Task created:", task.id, task.title, "parent:", parentID || "none")
  }

  // session.idle - fires when a subagent session completes (agent finished responding)
  // This is the correct event for marking tasks as completed (replaces non-existent session.complete)
  else if (type === "session.idle") {
    const sessionId = properties.sessionID
    const title = properties.info?.title

    btpLog("DEBUG", "session.idle for session:", sessionId, "title:", title)

    if (!sessionId) {
      btpLog("ERROR", "No sessionID in session.idle event")
      return
    }

    const task = getTask(sessionId)
    if (task) {
      if (task.status === "running") {
        task.status = "completed"
        task.updatedAt = Date.now()
        setTask(task)
        btpLog("INFO", "Task completed via session.idle:", task.id, task.title)
      } else {
        btpLog("DEBUG", "Task not in running state:", task.status)
      }
    } else {
      btpLog("ERROR", "Task not found for session.idle:", sessionId)
    }
  }

  else if (type === "session.status") {
    const sessionId = properties.sessionID
    const status = properties.status
    btpLog("DEBUG", "session.status for session:", sessionId, "status:", JSON.stringify(status))

    // Track status changes to detect completion
    if (!sessionId) return
    const task = getTask(sessionId)
    if (!task) return

    // Parse status type
    const statusType = status?.type
    // idle = session finished normally, retry with high attempt count = failed
    if (statusType === "idle") {
      // Session is no longer busy - mark as completed if running
      if (task.status === "running") {
        task.status = "completed"
        task.updatedAt = Date.now()
        setTask(task)
        btpLog("INFO", "Task completed via session.status:", task.id, task.title)
      }
    } else if (statusType === "retry" && status.attempt >= 3) {
      // Multiple retries indicate failure
      if (task.status === "running") {
        task.status = "failed"
        task.updatedAt = Date.now()
        setTask(task)
        btpLog("INFO", "Task failed via session.status (多次重试):", task.id, task.title)
      }
    }
  }

  else if (type === "session.error") {
    const sessionId = properties.sessionID
    if (!sessionId) {
      btpLog("ERROR", "No sessionID in session.error event")
      return
    }

    btpLog("ERROR", "session.error for session:", sessionId)

    const task = getTask(sessionId)
    if (task) {
      task.status = "failed"
      task.updatedAt = Date.now()
      setTask(task)
      btpLog("ERROR", "Task failed:", task.id, task.title)
    }
  }

  else {
    btpLog("DEBUG", "Unhandled event type:", type)
  }
}

// HOOKS PATTERN - This is the correct way to receive events
const serverPlugin: Plugin = async (input: PluginInput) => {
  btpLog("INFO", "Server plugin starting with Hooks pattern...")

  // Store client for API calls
  pluginClient = input.client
  btpLog("INFO", "Client available:", !!pluginClient)

  // Load tasks from SQLite
  loadTasks()

  // Try to refresh running tasks status via API (may timeout)
  refreshRunningTasks().catch(e => btpLog("ERROR", "Refresh error:", e.message))

  // Return hooks object - OpenCode will call our event handler
  return {
    event: async ({ event }) => {
      await handleEvent(event)
    }
  }
}

export default serverPlugin