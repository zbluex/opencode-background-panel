/** @jsxImportSource @opentui/solid */
// @ts-nocheck
import { createSignal, createMemo, createEffect, onCleanup } from "solid-js"
import type { TuiSlotPlugin, TuiPluginApi, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import { Database as BunSqlite } from "bun:sqlite"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { homedir } from "os"
import { existsSync, readFileSync } from "fs"

const SINGLE_BORDER = { type: "single" } as any
const TIME_UPDATE_INTERVAL_MS = 500
const POLL_INTERVAL_MS = 1000

// Derive data directory relative to this file's location
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
// sidebar-content.tsx is at src/tui/slots/, so 3 levels up to plugin root
const PLUGIN_ROOT = join(__dirname, "..", "..", "..")
const DATA_DIR = join(PLUGIN_ROOT, "data")
const DB_FILE = join(DATA_DIR, "tasks.db")
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

// Load config for log level (synchronous)
function loadConfig(): void {
  try {
    if (existsSync(CONFIG_FILE)) {
      const content = readFileSync(CONFIG_FILE, "utf-8")
      const cleanContent = content
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
      const config = JSON.parse(cleanContent)
      logLevel = (config.log_level as LogLevel) || "ERROR"
    }
  } catch (e) {
    // Use default ERROR level
  }
}

loadConfig()

interface Task {
  id: string
  sessionId: string
  parentSessionId?: string
  type: "session_create" | "session_complete" | "error"
  title: string
  status: "running" | "pending" | "completed" | "failed"
  createdAt: number
  updatedAt: number
  pid?: number
}

// Read tasks from SQLite using bun:sqlite
async function readTasksFromDb(): Promise<Task[]> {
  try {
    const fs = await import("fs")
    btpLog("DEBUG", "DB_FILE path:", DB_FILE)
    btpLog("DEBUG", "DB_FILE exists:", fs.existsSync(DB_FILE))
    if (!fs.existsSync(DB_FILE)) {
      btpLog("DEBUG", "DB file not found, returning cached tasks:", cachedTasks.length)
      return cachedTasks.length > 0 ? cachedTasks : []
    }

    // Always read DB to get latest data
    const stat = fs.statSync(DB_FILE)
    btpLog("DEBUG", "DB file size:", stat.size, "bytes")

    // Open DB with bun:sqlite (readonly mode for TUI)
    const db = new BunSqlite(DB_FILE)

    const tasks: Task[] = []
    const rows = db.query("SELECT * FROM tasks ORDER BY updatedAt DESC").all() as any[]
    btpLog("DEBUG", "Query returned", rows.length, "rows")

    for (const row of rows) {
      tasks.push({
        id: row.id,
        sessionId: row.sessionId,
        parentSessionId: row.parentSessionId,
        type: row.type,
        title: row.title,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        pid: row.pid
      })
    }

    db.close()
    btpLog("DEBUG", "TUI: Read", tasks.length, "tasks from DB")

    // Update cache
    cachedTasks = tasks
    btpLog("DEBUG", "TUI: Cache updated with", tasks.length, "tasks")
    return tasks
  } catch (e) {
    btpLog("ERROR", "TUI read error:", e)
    // Return cached tasks on error to prevent clearing
    return cachedTasks.length > 0 ? cachedTasks : []
  }
}

// Module-level state - cache tasks to prevent clearing on errors
let cachedTasks: Task[] = []

// Format relative time
function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// Get status icon
function getStatusIcon(status: string): string {
  switch (status) {
    case "running": return "▶"
    case "completed": return "✓"
    case "failed": return "✗"
    case "pending": return "○"
    default: return "?"
  }
}

// StatRow component for displaying label/value pairs
const StatRow = (props: {
  theme: TuiThemeCurrent
  label: string
  value: string
  accent?: boolean
  dim?: boolean
}) => (
  <box width="100%" flexDirection="row" justifyContent="space-between">
    <text fg={props.theme.text}>{props.label}</text>
    <text
      fg={
        props.dim
          ? props.theme.textMuted
          : props.accent
          ? props.theme.accent
          : props.theme.text
      }
    >
      {props.value}
    </text>
  </box>
)

// SectionHeader component
const SectionHeader = (props: { theme: TuiThemeCurrent; title: string }) => (
  <box width="100%" marginTop={1} flexDirection="row" justifyContent="space-between">
    <text fg={props.theme.text}>
      <b>{props.title}</b>
    </text>
  </box>
)

const TaskPanel = (props: { api: TuiPluginApi; sessionID: () => string; theme: TuiThemeCurrent }) => {
  const [snapshot, setSnapshot] = createSignal<Task[]>([])
  const [filterMode, setFilterMode] = createSignal<"all" | "session">("session")
  let timeUpdateTimer: ReturnType<typeof setInterval> | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined

  // Start polling on mount
  createEffect(() => {
    btpLog("DEBUG", "TUI panel mounting, starting poll...")

    readTasksFromDb().then(tasks => {
      setSnapshot(tasks)
      btpLog("DEBUG", "Initial tasks loaded:", tasks.length)
    })

    pollTimer = setInterval(async () => {
      const tasks = await readTasksFromDb()
      setSnapshot(tasks)
    }, POLL_INTERVAL_MS)

    timeUpdateTimer = setInterval(() => {
      props.api.renderer.requestRender()
    }, TIME_UPDATE_INTERVAL_MS)
  })

  onCleanup(() => {
    if (timeUpdateTimer) clearInterval(timeUpdateTimer)
    if (pollTimer) clearInterval(pollTimer)
    btpLog("DEBUG", "TUI panel unmounting, stopped polling")
  })

  const handleTaskClick = (task: Task) => {
    btpLog("DEBUG", "Navigating to task session:", task.sessionId)
    props.api.route.navigate("session", { sessionID: task.sessionId })
  }

  const toggleFilter = () => {
    setFilterMode(prev => prev === "all" ? "session" : "all")
    btpLog("DEBUG", "Filter mode:", filterMode())
  }

  // Filter tasks based on current session
  const filteredTasks = createMemo(() => {
    const mode = filterMode()
    const currentSession = props.sessionID()
    const tasks = snapshot()

    btpLog("DEBUG", "Filter mode:", mode, "currentSession:", currentSession, "total tasks:", tasks.length)

    if (mode === "session") {
      // Show tasks created BY current session (parent) or FOR current session (child)
      const filtered = tasks.filter(t =>
        t.parentSessionId === currentSession ||
        t.sessionId === currentSession
      )
      btpLog("DEBUG", "Session filtered:", filtered.length, "tasks")
      return filtered
    }
    return tasks
  })

  const runningTasks = createMemo(() => filteredTasks().filter(t => t.status === "running"))
  const completedTasks = createMemo(() => filteredTasks().filter(t => t.status === "completed"))
  const failedTasks = createMemo(() => filteredTasks().filter(t => t.status === "failed"))

  return (
    <box
      width="100%"
      flexDirection="column"
      border={SINGLE_BORDER}
      borderColor={props.theme.borderActive}
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={1}
      paddingRight={1}
    >
      {/* Header */}
      <box flexDirection="row" justifyContent="space-between" alignItems="center">
        <box paddingLeft={1} paddingRight={1} backgroundColor={props.theme.accent} onMouseDown={toggleFilter}>
          <text fg={props.theme.background}>
            <b>Tasks {filterMode() === "session" ? "[Session]" : "[All]"}</b>
          </text>
        </box>
        <text fg={props.theme.textMuted}>v0.2.0</text>
      </box>

      {/* Running section */}
      <box width="100%" marginTop={1} flexDirection="row" justifyContent="space-between">
        <text fg={props.theme.text}>
          <b>Running</b>
        </text>
        {runningTasks().length > 0 ? (
          <text fg={props.theme.warning}>{runningTasks().length} active</text>
        ) : (
          <text fg={props.theme.textMuted}>idle</text>
        )}
      </box>

      {/* Task list */}
      <box flexDirection="column" width="100%">
        {runningTasks().length === 0 && completedTasks().length === 0 && failedTasks().length === 0 ? (
          <box paddingLeft={1} paddingTop={1}>
            <text fg={props.theme.textMuted}>No tasks yet</text>
          </box>
        ) : (
          <>
            {/* Running tasks */}
            {runningTasks().map((task) => (
              <box
                key={task.id}
                width="100%"
                flexDirection="row"
                paddingLeft={1}
                paddingRight={1}
                onMouseDown={() => handleTaskClick(task)}
              >
                <text fg={props.theme.warning}>{getStatusIcon(task.status)}</text>
                <text fg={props.theme.text} marginLeft={1} width={25}>
                  {task.title.substring(0, 20)}
                </text>
                <text fg={props.theme.textMuted}>
                  {formatRelativeTime(task.updatedAt)}
                </text>
              </box>
            ))}

            {/* Completed section */}
            {completedTasks().length > 0 && (
              <>
                <SectionHeader theme={props.theme} title="Completed" />
                {completedTasks().slice(0, 5).map((task) => (
                  <box
                    key={task.id}
                    width="100%"
                    flexDirection="row"
                    paddingLeft={1}
                    paddingRight={1}
                    onMouseDown={() => handleTaskClick(task)}
                  >
                    <text fg={props.theme.success}>{getStatusIcon(task.status)}</text>
                    <text fg={props.theme.textMuted} marginLeft={1} width={25}>
                      {task.title.substring(0, 20)}
                    </text>
                    <text fg={props.theme.textMuted}>
                      {formatRelativeTime(task.updatedAt)}
                    </text>
                  </box>
                ))}
              </>
            )}

            {/* Failed section */}
            {failedTasks().length > 0 && (
              <>
                <SectionHeader theme={props.theme} title="Failed" />
                {failedTasks().slice(0, 5).map((task) => (
                  <box
                    key={task.id}
                    width="100%"
                    flexDirection="row"
                    paddingLeft={1}
                    paddingRight={1}
                    onMouseDown={() => handleTaskClick(task)}
                  >
                    <text fg={props.theme.error}>{getStatusIcon(task.status)}</text>
                    <text fg={props.theme.textMuted} marginLeft={1} width={25}>
                      {task.title.substring(0, 20)}
                    </text>
                    <text fg={props.theme.textMuted}>
                      {formatRelativeTime(task.updatedAt)}
                    </text>
                  </box>
                ))}
              </>
            )}
          </>
        )}
      </box>

      {/* Stats footer */}
      <box width="100%" marginTop={1} border={{ top: { style: "single" } }} paddingTop={1}>
        <StatRow
          theme={props.theme}
          label="Total"
          value={String(filteredTasks().length)}
        />
        <StatRow
          theme={props.theme}
          label="Completed"
          value={String(completedTasks().length)}
          dim
        />
        <StatRow
          theme={props.theme}
          label="Failed"
          value={String(failedTasks().length)}
          dim
        />
      </box>
    </box>
  )
}

export function createSidebarContentSlot(api: TuiPluginApi): TuiSlotPlugin {
    return {
        order: 150,
        slots: {
            sidebar_content: (ctx, value) => {
                const theme = createMemo(() => ctx.theme.current)
                return (
                    <TaskPanel
                        api={api}
                        sessionID={() => value.session_id}
                        theme={theme()}
                    />
                )
            },
        },
    }
}