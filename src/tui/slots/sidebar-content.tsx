/** @jsxImportSource @opentui/solid */
// @ts-nocheck
import { createSignal, createMemo, createEffect, onCleanup } from "solid-js"
import type { TuiSlotPlugin, TuiPluginApi, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import { Database as BunSqlite } from "bun:sqlite"

const SINGLE_BORDER = { type: "single" } as any
const TIME_UPDATE_INTERVAL_MS = 500
const POLL_INTERVAL_MS = 1000

const DATA_DIR = "C:/Users/zbluex/.config/opencode/plugins/background-task-panel/data"
const DB_FILE = `${DATA_DIR}/tasks.db`

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
    if (!fs.existsSync(DB_FILE)) {
      return cachedTasks.length > 0 ? cachedTasks : []
    }

    // Always read DB to get latest data
    const stat = fs.statSync(DB_FILE)

    // Open DB with bun:sqlite (readonly mode for TUI)
    const db = new BunSqlite(DB_FILE)

    const tasks: Task[] = []
    const rows = db.query("SELECT * FROM tasks ORDER BY updatedAt DESC").all() as any[]

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
    console.log("[BTP] TUI: Read", tasks.length, "tasks from DB")

    // Update cache
    cachedTasks = tasks
    console.log("[BTP] TUI: Cache updated with", tasks.length, "tasks")
    return tasks
  } catch (e) {
    console.log("[BTP] TUI read error:", e)
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
    console.log("[BTP] TUI panel mounting, starting poll...")

    readTasksFromDb().then(tasks => {
      setSnapshot(tasks)
      console.log("[BTP] Initial tasks loaded:", tasks.length)
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
    console.log("[BTP] TUI panel unmounting, stopped polling")
  })

  const handleTaskClick = (task: Task) => {
    console.log("[BTP] Navigating to task session:", task.sessionId)
    props.api.route.navigate("session", { sessionID: task.sessionId })
  }

  const toggleFilter = () => {
    setFilterMode(prev => prev === "all" ? "session" : "all")
    console.log("[BTP] Filter mode:", filterMode())
  }

  // Filter tasks based on current session
  const filteredTasks = createMemo(() => {
    const mode = filterMode()
    const currentSession = props.sessionID()
    const tasks = snapshot()

    console.log("[BTP] Filter mode:", mode, "currentSession:", currentSession, "total tasks:", tasks.length)

    if (mode === "session") {
      // Show tasks created BY current session (parent) or FOR current session (child)
      const filtered = tasks.filter(t =>
        t.parentSessionId === currentSession ||
        t.sessionId === currentSession
      )
      console.log("[BTP] Session filtered:", filtered.length, "tasks")
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
          value={String(snapshot().length)}
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
