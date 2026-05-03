// Server Plugin - Background Task Panel
// Uses the Hooks pattern to receive events from OpenCode

import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import { loadTasks, persist, getTask, setTask, getAllTasks } from "./repo/Database.js"
import { readFileSync, existsSync, writeFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { homedir } from "os"

console.log("[BTP] Server plugin module loaded")

// Derive config path relative to user config directory
// Uses ~/.config/opencode/ for portability across platforms
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const CONFIG_FILE = join(homedir(), ".config", "opencode", "background-panel.jsonc")

// Skip task patterns
let skipTaskPatterns: RegExp[] = []

// Load config (synchronous)
function loadConfig(): void {
  try {
    if (!existsSync(CONFIG_FILE)) {
      console.log("[BTP] Config file not found, creating default at", CONFIG_FILE)
      const defaultConfig = `{
  // Skip task patterns - titles matching these regex patterns will be skipped
  // Examples:
  //   "magic-context-compartment" - skip magic context compartments
  //   "^test" - skip tasks starting with "test"
  //   ".*ignore.*" - skip tasks containing "ignore"
  "skip_tasks": []
}
`
      try {
        writeFileSync(CONFIG_FILE, defaultConfig, "utf-8")
      } catch (e) {
        console.log("[BTP] Failed to create config file:", e)
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
    const patterns: string[] = config.skip_tasks || []

    skipTaskPatterns = patterns.map(p => new RegExp(p))
    console.log("[BTP] Loaded", skipTaskPatterns.length, "skip patterns:", patterns)
  } catch (e) {
    console.log("[BTP] Config load error:", e)
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
    console.log("[BTP] Failed to check session status:", e)
  }
  return null
}

// Refresh running tasks by checking their actual session status via API
async function refreshRunningTasks(): Promise<void> {
  const tasks = getAllTasks()
  const runningTasks = tasks.filter(t => t.status === "running")

  if (runningTasks.length === 0) {
    console.log("[BTP] No running tasks to refresh")
    return
  }

  console.log("[BTP] Refreshing", runningTasks.length, "running tasks via session.status() API...")

  // Call session.status() to get all active session statuses
  const timeoutMs = 5000
  let statusResult: any = null

  try {
    statusResult = await Promise.race([
      pluginClient.session.status(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs))
    ])
  } catch (e: any) {
    console.log("[BTP] Session status API error:", e.message)
    return
  }

  // Parse result - curl test shows: { "sessionId": { type: "busy" } }
  // SDK wraps it in { data: { "200": { sessionId: { type } } } }
  const statusData = statusResult?.data?.["200"] || {}
  const activeSessionIds = Object.keys(statusData)
  console.log("[BTP] Active sessions:", activeSessionIds)

  for (const task of runningTasks) {
    console.log("[BTP] Checking task:", task.sessionId, task.title)

    // If sessionId is NOT in active sessions, it has failed (not completed)
    if (!activeSessionIds.includes(task.sessionId)) {
      console.log("[BTP] Session not in active list -> marking as FAILED:", task.sessionId)
      task.status = "failed"
      task.updatedAt = Date.now()
      setTask(task)
      continue
    }

    // Session is active - check its status
    const sessionStatus = statusData[task.sessionId]
    if (sessionStatus) {
      console.log("[BTP] Session status:", task.sessionId, sessionStatus.type)

      if (sessionStatus.type === "idle") {
        task.status = "completed"
        task.updatedAt = Date.now()
        setTask(task)
        console.log("[BTP] Task marked completed:", task.title)
      } else if (sessionStatus.type === "retry" && sessionStatus.attempt >= 3) {
        task.status = "failed"
        task.updatedAt = Date.now()
        setTask(task)
        console.log("[BTP] Task marked failed (retry):", task.title)
      }
      // "busy" sessions remain running
    }
  }
}

async function handleEvent(event: any) {
  const { type, properties = {} } = event

  console.log("[BTP] Event received:", type, "sessionID:", properties.sessionID)

  if (type === "session.created") {
    const sessionId = properties.sessionID || properties.info?.id
    const title = properties.info?.title
    const parentID = properties.info?.parentID

    console.log("[BTP] === SESSION.CREATED DEBUG ===")
    console.log("[BTP] Full event properties:", JSON.stringify(properties, null, 2))
    console.log("[BTP] sessionId:", sessionId)
    console.log("[BTP] title:", title)
    console.log("[BTP] parentID:", parentID)
    console.log("[BTP] ==================================")

    // Filter out tasks matching skip patterns
    if (shouldSkipTask(title)) {
      console.log("[BTP] Skipping task (matched skip pattern):", title)
      return
    }

    if (!sessionId) {
      console.log("[BTP] No sessionId in session.created event")
      return
    }

    if (!parentID) {
      console.log("[BTP] NOT creating task - no parentID. Title:", title)
      return
    }

    console.log("[BTP] Creating task for subagent session...")

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
    console.log("[BTP] Task created:", task.id, task.title, "parent:", parentID || "none")
    console.log("[BTP] DB should now have this task")
  }

  // session.idle - fires when a subagent session completes (agent finished responding)
  // This is the correct event for marking tasks as completed (replaces non-existent session.complete)
  else if (type === "session.idle") {
    const sessionId = properties.sessionID
    const title = properties.info?.title

    console.log("[BTP] session.idle for session:", sessionId, "title:", title)

    if (!sessionId) {
      console.log("[BTP] No sessionID in session.idle event")
      return
    }

    const task = getTask(sessionId)
    if (task) {
      if (task.status === "running") {
        task.status = "completed"
        task.updatedAt = Date.now()
        setTask(task)
        console.log("[BTP] Task completed via session.idle:", task.id, task.title)
      } else {
        console.log("[BTP] Task not in running state:", task.status)
      }
    } else {
      console.log("[BTP] Task not found for session.idle:", sessionId)
    }
  }

  else if (type === "session.status") {
    const sessionId = properties.sessionID
    const status = properties.status
    console.log("[BTP] session.status for session:", sessionId, "status:", JSON.stringify(status))

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
        console.log("[BTP] Task completed via session.status:", task.id, task.title)
      }
    } else if (statusType === "retry" && status.attempt >= 3) {
      // Multiple retries indicate failure
      if (task.status === "running") {
        task.status = "failed"
        task.updatedAt = Date.now()
        setTask(task)
        console.log("[BTP] Task failed via session.status (多次重试):", task.id, task.title)
      }
    }
  }

  else if (type === "session.error") {
    const sessionId = properties.sessionID
    if (!sessionId) {
      console.log("[BTP] No sessionID in session.error event")
      return
    }

    console.log("[BTP] session.error for session:", sessionId)

    const task = getTask(sessionId)
    if (task) {
      task.status = "failed"
      task.updatedAt = Date.now()
      setTask(task)
      console.log("[BTP] Task failed:", task.id, task.title)
    }
  }

  else {
    console.log("[BTP] Unhandled event type:", type)
  }
}

// HOOKS PATTERN - This is the correct way to receive events
const serverPlugin: Plugin = async (input: PluginInput) => {
  console.log("[BTP] Server plugin starting with Hooks pattern...")

  // Store client for API calls
  pluginClient = input.client
  console.log("[BTP] Client available:", !!pluginClient)

  // Load tasks from SQLite
  loadTasks()

  // Try to refresh running tasks status via API (may timeout)
  refreshRunningTasks().catch(e => console.log("[BTP] Refresh error:", e.message))

  // Return hooks object - OpenCode will call our event handler
  return {
    event: async ({ event }) => {
      await handleEvent(event)
    }
  }
}

export default serverPlugin