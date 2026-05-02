/** @jsxImportSource @opentui/solid */
// @ts-nocheck
import { createSignal, createMemo, createEffect, on, onCleanup } from "solid-js"
import type { TuiSlotPlugin, TuiPluginApi, TuiThemeCurrent } from "@opencode-ai/plugin/tui"

const SINGLE_BORDER = { type: "single" } as any
const REFRESH_DEBOUNCE_MS = 150
const TIME_UPDATE_INTERVAL_MS = 500 // Poll every 500ms for real-time updates

interface Task {
  id: string
  title: string
  description?: string
  status: "running" | "pending" | "completed" | "failed"
  agent?: string
  createdAt: number
  updatedAt: number
}

// Global task store - persists across renders
const tasks = new Map<string, Task>()

// Map to track session ID to task ID mapping
const sessionToTask = new Map<string, string>()

function formatTime(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60000) return "just now"
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return `${Math.floor(diff / 3600000)}h ago`
}

function statusIcon(status: string): string {
  switch (status) {
    case "running": return "🟢"
    case "pending": return "🟡"
    case "completed": return "✅"
    case "failed": return "🔴"
    default: return "⚪"
  }
}

function statusColor(status: string, t: TuiThemeCurrent): string {
  switch (status) {
    case "running": return t.accent
    case "pending": return t.warning
    case "completed": return "#34d399"
    case "failed": return t.error
    default: return t.textMuted
  }
}

const StatRow = (props: {
  theme: TuiThemeCurrent
  label: string
  value: string
  accent?: boolean
  warning?: boolean
  dim?: boolean
}) => {
  const fg = createMemo(() => {
    if (props.warning) return props.theme.warning
    if (props.accent) return props.theme.accent
    if (props.dim) return props.theme.textMuted
    return props.theme.text
  })
  return (
    <box width="100%" flexDirection="row" justifyContent="space-between">
      <text fg={props.theme.textMuted}>{props.label}</text>
      <text fg={fg()}><b>{props.value}</b></text>
    </box>
  )
}

const TaskPanel = (props: { api: TuiPluginApi; sessionID: () => string; theme: TuiThemeCurrent }) => {
  const [snapshot, setSnapshot] = createSignal<Task[]>([])
  const [tick, setTick] = createSignal(0) // Force refresh for time updates
  let refreshTimer: ReturnType<typeof setTimeout> | undefined
  let timeUpdateTimer: ReturnType<typeof setInterval> | undefined

  const t = createMemo(() => props.theme)

  const refresh = () => {
    setSnapshot(Array.from(tasks.values()))
    // Also trigger tick to force time display updates
    setTick(t => t + 1)
    try {
      props.api.renderer.requestRender()
    } catch {}
  }

  const scheduleRefresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined
      refresh()
    }, REFRESH_DEBOUNCE_MS)
  }

  onCleanup(() => {
    if (refreshTimer) clearTimeout(refreshTimer)
    if (timeUpdateTimer) clearInterval(timeUpdateTimer)
  })

  // Time update interval - forces UI refresh every 500ms for real-time display
  // This ensures when switching back to the panel, updated times and statuses are shown immediately
  createEffect(() => {
    // Clear existing timer
    if (timeUpdateTimer) clearInterval(timeUpdateTimer)
    // Start new interval that forces re-render
    // Always update to show current time, not just when tasks are running
    timeUpdateTimer = setInterval(() => {
      setTick(t => t + 1)  // Force component to re-render
      scheduleRefresh()
    }, TIME_UPDATE_INTERVAL_MS)
  })

  // Subscribe to events for live updates
  createEffect(
    on(
      props.sessionID,
      (sessionID) => {
        const unsubs = [
          props.api.event.on("session.created", (event) => {
            const info = event.properties.info as { id?: string; session_id?: string; title?: string } | undefined
            const taskId = info?.id || info?.session_id || "unknown"
            const sessionId = info?.session_id || info?.id || taskId
            const task: Task = {
              id: taskId,
              title: info?.title || "Untitled Task",
              status: "running",
              createdAt: Date.now(),
              updatedAt: Date.now(),
            }
            tasks.set(taskId, task)
            sessionToTask.set(sessionId, taskId)
            scheduleRefresh()
          }),
          props.api.event.on("session.updated", (event) => {
            const info = event.properties.info as { id?: string; session_id?: string } | undefined
            const taskId = info?.id || info?.session_id
            if (!taskId) return
            const task = tasks.get(taskId)
            // Only update if task is still running - don't overwrite completed/failed status
            if (task && task.status === "running") {
              task.updatedAt = Date.now()
              scheduleRefresh()
            }
          }),
          props.api.event.on("session.idle", (event) => {
            // sessionID is directly on properties (camelCase), not nested under info
            const sessionId = event.properties.sessionID as string | undefined
            if (!sessionId) return
            // Look up task by session ID mapping, then by direct ID lookup
            const taskId = sessionToTask.get(sessionId)
            const task = taskId ? tasks.get(taskId) : tasks.get(sessionId)
            // Only mark as completed if it was created by us and still running
            if (task && task.status === "running") {
              task.status = "completed"
              task.updatedAt = Date.now()
              scheduleRefresh()
            }
          }),
          props.api.event.on("session.error", (event) => {
            // sessionID is directly on properties (camelCase), not nested under info
            const sessionId = event.properties.sessionID as string | undefined
            if (!sessionId) return
            // Look up task by session ID mapping, then by direct ID lookup
            const taskId = sessionToTask.get(sessionId)
            const task = taskId ? tasks.get(taskId) : tasks.get(sessionId)
            // Only mark as failed if it was created by us and still running
            if (task && task.status === "running") {
              task.status = "failed"
              task.updatedAt = Date.now()
              scheduleRefresh()
            }
          }),
        ]
        onCleanup(() => {
          for (const unsub of unsubs) unsub()
        })
      },
      { defer: false },
    ),
  )

  const runningCount = createMemo(() => snapshot().filter((task) => task.status === "running").length)
  const completedCount = createMemo(() => snapshot().filter((task) => task.status === "completed").length)
  const failedCount = createMemo(() => snapshot().filter((task) => task.status === "failed").length)

  return (
    <box
      width="100%"
      flexDirection="column"
      border={SINGLE_BORDER}
      borderColor={t().borderActive}
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={1}
      paddingRight={1}
    >
      {/* Header */}
      <box flexDirection="row" justifyContent="space-between" alignItems="center">
        <box paddingLeft={1} paddingRight={1} backgroundColor={t().accent}>
          <text fg={t().background}><b>⚡ Background Tasks</b></text>
        </box>
        <text fg={t().textMuted}>v1.0.0</text>
      </box>

      {/* Summary stats */}
      <box flexDirection="row" justifyContent="space-between" marginTop={1}>
        <text fg={t().text}>Tasks</text>
        <text fg={t().accent}><b>{runningCount()} running</b></text>
      </box>

      {/* Task counts */}
      <box flexDirection="row" gap={2} marginTop={1}>
        <text fg={t().accent}>🟢 {runningCount()}</text>
        <text fg="#34d399">✅ {completedCount()}</text>
        <text fg={t().error}>🔴 {failedCount()}</text>
      </box>

      {/* Task List */}
      <box flexDirection="column" marginTop={1}>
        {snapshot().length === 0 && (
          <text fg={t().textMuted}>No background tasks</text>
        )}
        {snapshot().map((task) => (
          <box key={task.id} flexDirection="column" marginTop={1}>
            <box flexDirection="row" justifyContent="space-between">
              <text fg={statusColor(task.status, t())}>{statusIcon(task.status)}</text>
              <text fg={t().text}><b>{task.title}</b></text>
              <text fg={t().textMuted}>{formatTime(task.updatedAt)}</text>
            </box>
            <box flexDirection="row" justifyContent="space-between">
              <text fg={statusColor(task.status, t())}><b>{task.status.toUpperCase()}</b></text>
            </box>
          </box>
        ))}
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
