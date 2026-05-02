/** @jsxImportSource @opentui/solid */
// @ts-nocheck
import { createSignal, createMemo, createEffect, on, onCleanup } from "solid-js"
import type { TuiSlotPlugin, TuiPluginApi, TuiThemeCurrent } from "@opencode-ai/plugin/tui"

const SINGLE_BORDER = { type: "single" } as any
const TIME_UPDATE_INTERVAL_MS = 500

interface Task {
  id: string
  title: string
  description?: string
  status: "running" | "pending" | "completed" | "failed"
  agent?: string
  createdAt: number
  updatedAt: number
  sessionId?: string
}

// Module-level state - persists across component instances
const tasks = new Map<string, Task>()
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

const TaskPanel = (props: { api: TuiPluginApi; sessionID: () => string; theme: TuiThemeCurrent }) => {
  const [snapshot, setSnapshot] = createSignal<Task[]>([])
  let timeUpdateTimer: ReturnType<typeof setInterval> | undefined

  const t = createMemo(() => props.theme)

  const refresh = () => {
    setSnapshot(Array.from(tasks.values()))
  }

  // Set up event subscriptions - these persist at module level
  // We use a closure to keep the unsubscribe function
  const setupEvents = () => {
    const unsubCreated = props.api.event.on("session.created", (event) => {
      const sessionId = (event.properties.sessionID as string | undefined) || (event.properties.info as { id?: string; session_id?: string })?.id
      if (!sessionId) return
      const info = event.properties.info as { id?: string; session_id?: string; title?: string } | undefined
      const taskId = info?.id || sessionId
      const task: Task = {
        id: taskId,
        title: info?.title || "Untitled Task",
        status: "running",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sessionId: sessionId,
      }
      tasks.set(taskId, task)
      sessionToTask.set(sessionId, taskId)
      refresh()
    })

    const unsubIdle = props.api.event.on("session.idle", (event) => {
      const sessionId = event.properties.sessionID as string | undefined
      if (!sessionId) return
      const taskId = sessionToTask.get(sessionId)
      const task = taskId ? tasks.get(taskId) : tasks.get(sessionId)
      if (task && task.status === "running") {
        task.status = "completed"
        task.updatedAt = Date.now()
        refresh()
      }
    })

    const unsubError = props.api.event.on("session.error", (event) => {
      const sessionId = event.properties.sessionID as string | undefined
      if (!sessionId) return
      const taskId = sessionToTask.get(sessionId)
      const task = taskId ? tasks.get(taskId) : tasks.get(sessionId)
      if (task && task.status === "running") {
        task.status = "failed"
        task.updatedAt = Date.now()
        refresh()
      }
    })

    return () => {
      unsubCreated()
      unsubIdle()
      unsubError()
    }
  }

  // Module-level unsubscribe function - persists across component instances
  const unsubscribe = setupEvents()

  onCleanup(() => {
    if (timeUpdateTimer) clearInterval(timeUpdateTimer)
    // Note: We intentionally DON'T call unsubscribe() here
    // because we want event subscriptions to persist across panel navigation
  })

  // Time update: refresh UI periodically to update "X ago" timestamps
  createEffect(() => {
    timeUpdateTimer = setInterval(() => {
      refresh()
      try {
        props.api.renderer.requestRender()
      } catch {}
    }, TIME_UPDATE_INTERVAL_MS)
    onCleanup(() => {
      if (timeUpdateTimer) clearInterval(timeUpdateTimer)
    })
  })

  // Initial render
  refresh()

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
          <box
            key={task.id}
            flexDirection="column"
            marginTop={1}
            onMouseDown={() => {
              if (task.sessionId) {
                props.api.route.navigate("session", { sessionID: task.sessionId })
              }
            }}
          >
            <box flexDirection="row" justifyContent="space-between">
              <text fg={statusColor(task.status, t())}>{statusIcon(task.status)}</text>
              <text fg={t().text}><b>{task.title}</b></text>
              <text fg={t().textMuted}>{formatTime(task.updatedAt)}</text>
            </box>
            <box flexDirection="row" justifyContent="space-between">
              <text fg={statusColor(task.status, t())}><b>{task.status.toUpperCase()}</b></text>
              {task.sessionId && <text fg={t().accent}>Click to open</text>}
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