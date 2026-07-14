import { createElement as _$createElement } from "opentui:runtime-module:%40opentui%2Fsolid"
import { createComponent as _$createComponent } from "opentui:runtime-module:%40opentui%2Fsolid"
import { setProp as _$setProp } from "opentui:runtime-module:%40opentui%2Fsolid"
import { insert as _$insert } from "opentui:runtime-module:%40opentui%2Fsolid"
import { insertNode as _$insertNode } from "opentui:runtime-module:%40opentui%2Fsolid"
import { createTextNode as _$createTextNode } from "opentui:runtime-module:%40opentui%2Fsolid"
import { memo as _$memo } from "opentui:runtime-module:%40opentui%2Fsolid"
import { effect as _$effect } from "opentui:runtime-module:%40opentui%2Fsolid"
// @ts-nocheck
import { createSignal, createMemo, createEffect, onCleanup } from "opentui:runtime-module:solid-js"
import { Database as BunSqlite } from "bun:sqlite"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { homedir } from "os"
import { existsSync, readFileSync } from "fs"
import packageJson from "../../../package.json"

const SINGLE_BORDER = { type: "single" }
const TIME_UPDATE_INTERVAL_MS = 500
const POLL_INTERVAL_MS = 1000

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const CONFIG_DIR = join(homedir(), ".config", "opencode", "background-panel")
const DATA_DIR_FALLBACK = CONFIG_DIR
const DB_FILE_FALLBACK = join(DATA_DIR_FALLBACK, "tasks.db")
const CONFIG_FILE = join(homedir(), ".config", "opencode", "background-panel.jsonc")

let DATA_DIR = DATA_DIR_FALLBACK
let DB_FILE = DB_FILE_FALLBACK

type LogLevel = "DEBUG" | "INFO" | "ERROR" | "NONE"
let logLevel: LogLevel = "NONE"

function btpLog(level: LogLevel, ...args: any[]): void {
  if (logLevel === "NONE") return
  const levels: LogLevel[] = ["DEBUG", "INFO", "ERROR"]
  const current = levels.indexOf(logLevel)
  const message = levels.indexOf(level)
  if (message >= current) {
    console.log("[BTP] [" + level + "]", ...args)
  }
}

function loadConfig(): void {
  try {
    if (existsSync(CONFIG_FILE)) {
      const content = readFileSync(CONFIG_FILE, "utf-8")
      const cleanContent = content
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
      const config = JSON.parse(cleanContent)
      logLevel = (config.log_level as LogLevel) || "NONE"
      if (config.data_dir) { DATA_DIR = config.data_dir }
      if (config.db_file) { DB_FILE = config.db_file }
      btpLog("DEBUG", "Config loaded - data_dir:", DATA_DIR, "db_file:", DB_FILE)
    } else {
      btpLog("DEBUG", "Config not found, using fallback paths - data_dir:", DATA_DIR)
    }
  } catch (e) {
    btpLog("ERROR", "Config load error:", e)
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

async function readTasksFromDb(): Promise<Task[]> {
  try {
    const fs = await import("fs")
    if (!fs.existsSync(DB_FILE)) {
      return cachedTasks.length > 0 ? cachedTasks : []
    }
    const db = new BunSqlite(DB_FILE)
    const tasks: Task[] = []
    const rows = db.query("SELECT * FROM tasks ORDER BY updatedAt DESC").all() as any[]
    for (const row of rows) {
      tasks.push({
        id: row.id, sessionId: row.sessionId, parentSessionId: row.parentSessionId,
        type: row.type, title: row.title, status: row.status,
        createdAt: row.createdAt, updatedAt: row.updatedAt, pid: row.pid
      })
    }
    db.close()
    cachedTasks = tasks
    return tasks
  } catch (e) {
    return cachedTasks.length > 0 ? cachedTasks : []
  }
}

let cachedTasks: Task[] = []

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function getStatusIcon(status: string): string {
  switch (status) {
    case "running": return "\u25B6"
    case "completed": return "\u2713"
    case "failed": return "\u2717"
    case "pending": return "\u25CB"
    default: return "?"
  }
}

// ---- StatRow - matches magic-context's `R` component pattern exactly ----

const StatRow = (props: { theme: any; label: string; value: string; accent?: boolean; dim?: boolean }) => (() => {
  const _el = _$createElement("box")
  const _lbl = _$createElement("text")
  const _val = _$createElement("text")

  _$insertNode(_el, _lbl)
  _$insertNode(_el, _val)

  _$setProp(_el, "width", "100%")
  _$setProp(_el, "flexDirection", "row")
  _$setProp(_el, "justifyContent", "space-between")

  _$insert(_lbl, () => props.label)
  _$insert(_val, () => props.value)

  _$effect(_p$ => {
    var _v$ = props.theme.text,
        _v$2 = props.dim ? props.theme.textMuted : props.accent ? props.theme.accent : props.theme.text
    _v$ !== _p$.e && (_p$.e = _$setProp(_lbl, "fg", _v$, _p$.e))
    _v$2 !== _p$.t && (_p$.t = _$setProp(_val, "fg", _v$2, _p$.t))
    return _p$
  }, { e: undefined, t: undefined })

  return _el
})()

// ---- SectionHeader ----

const SectionHeader = (props: { theme: any; title: string }) => (() => {
  const _el = _$createElement("box")
  const _text = _$createElement("text")
  const _b = _$createElement("b")

  _$insertNode(_el, _text)
  _$insertNode(_text, _b)
  _$setProp(_el, "width", "100%")
  _$setProp(_el, "marginTop", 1)
  _$setProp(_el, "flexDirection", "row")
  _$setProp(_el, "justifyContent", "space-between")
  _$insertNode(_b, _$createTextNode(props.title))

  _$effect(_p$ => {
    _p$.e = _$setProp(_text, "fg", props.theme.text, _p$.e)
    return _p$
  }, { e: undefined })

  return _el
})()

// ---- TaskPanel ----

const TaskPanel = (props: { api: any; sessionID: () => string; theme: any }) => (() => {
  const [snapshot, setSnapshot] = createSignal<Task[]>([])
  const [filterMode, setFilterMode] = createSignal<"all" | "session">("session")
  let timeUpdateTimer: ReturnType<typeof setInterval> | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined

  createEffect(() => {
    readTasksFromDb().then(tasks => setSnapshot(tasks))
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
  })

  const handleTaskClick = (task: Task) => {
    props.api.route.navigate("session", { sessionID: task.sessionId })
  }

  const toggleFilter = () => {
    setFilterMode(prev => prev === "all" ? "session" : "all")
  }

  const filteredTasks = createMemo(() => {
    const mode = filterMode()
    const currentSession = props.sessionID()
    const tasks = snapshot()
    if (mode === "session") {
      return tasks.filter(t =>
        t.parentSessionId === currentSession || t.sessionId === currentSession
      )
    }
    return tasks
  })

  const runningTasks = createMemo(() => filteredTasks().filter(t => t.status === "running"))
  const completedTasks = createMemo(() => filteredTasks().filter(t => t.status === "completed"))
  const failedTasks = createMemo(() => filteredTasks().filter(t => t.status === "failed"))

  // Create all elements at the top (magic-context pattern)
  const _root = _$createElement("box")
  const _headerRow = _$createElement("box")
  const _filterBtn = _$createElement("box")
  const _filterText = _$createElement("text")
  const _filterBold = _$createElement("b")
  const _versionText = _$createElement("text")
  const _statsRow = _$createElement("box")
  const _runningSection = _$createElement("box")
  const _runningText = _$createElement("text")
  const _runningBold = _$createElement("b")
  const _runningRight = _$createElement("text")
  const _taskList = _$createElement("box")

  // Establish parent-child tree FIRST (before setProp)
  _$insertNode(_root, _headerRow)
  _$insertNode(_root, _statsRow)
  _$insertNode(_root, _runningSection)
  _$insertNode(_root, _taskList)

  _$insertNode(_headerRow, _filterBtn)
  _$insertNode(_headerRow, _versionText)

  _$insertNode(_filterBtn, _filterText)
  _$insertNode(_filterText, _filterBold)

  _$insertNode(_runningSection, _runningText)
  _$insertNode(_runningSection, _runningRight)
  _$insertNode(_runningText, _runningBold)

  // Now set static props (order relative to insertNode doesn't matter)
  _$setProp(_root, "width", "100%")
  _$setProp(_root, "flexDirection", "column")
  _$setProp(_root, "border", SINGLE_BORDER)
  _$setProp(_root, "paddingTop", 1)
  _$setProp(_root, "paddingBottom", 1)
  _$setProp(_root, "paddingLeft", 1)
  _$setProp(_root, "paddingRight", 1)

  _$setProp(_headerRow, "flexDirection", "row")
  _$setProp(_headerRow, "justifyContent", "space-between")
  _$setProp(_headerRow, "alignItems", "center")

  _$setProp(_filterBtn, "paddingLeft", 1)
  _$setProp(_filterBtn, "paddingRight", 1)
  _$setProp(_filterBtn, "onMouseDown", toggleFilter)

  _$setProp(_statsRow, "width", "100%")
  _$setProp(_statsRow, "marginTop", 1)
  _$setProp(_statsRow, "flexDirection", "row")
  _$setProp(_statsRow, "justifyContent", "space-between")
  _$setProp(_statsRow, "alignItems", "center")

  _$setProp(_runningSection, "width", "100%")
  _$setProp(_runningSection, "marginTop", 1)
  _$setProp(_runningSection, "flexDirection", "row")
  _$setProp(_runningSection, "justifyContent", "space-between")

  _$setProp(_taskList, "flexDirection", "column")
  _$setProp(_taskList, "width", "100%")

  // Content via _$insert (reactive function accessors for dynamic values)
  _$insert(_filterBold, () => "Tasks " + (filterMode() === "session" ? "[Session]" : "[All]"))
  _$insert(_versionText, "v" + packageJson.version)
  _$insertNode(_runningBold, _$createTextNode("Running"))
  _$insert(_runningRight, () => runningTasks().length > 0 ? runningTasks().length + " active" : "idle")

  // Stats row: build inline stat text elements
  // Use _$insert with a function that creates text elements for each stat
  _$insert(_statsRow, () => {
    const rTotal = filteredTasks().length
    const rRunning = runningTasks().length
    const rCompleted = completedTasks().length
    const rFailed = failedTasks().length

    // Build one text per stat and return them as children array
    const statText = (fg: any, text: string) => {
      const _t = _$createElement("text")
      _$insert(_t, text)
      _$effect(_$p => {
        _$p.e = _$setProp(_t, "fg", fg, _$p.e)
        return _$p
      }, { e: undefined })
      return _t
    }

    return [
      statText(props.theme.textMuted, "\uD83D\uDCCA T:" + rTotal),
      statText(props.theme.warning, "\u25B6 R:" + rRunning),
      statText(props.theme.success, "\u2713 C:" + rCompleted),
      statText(props.theme.error, "\u2717 F:" + rFailed),
    ]
  })

  // Task list content - reactive
  _$insert(_taskList, () => {
    const runTasks = runningTasks()
    const compTasks = completedTasks()
    const failTasks = failedTasks()

    // Empty state
    if (runTasks.length === 0 && compTasks.length === 0 && failTasks.length === 0) {
      const _box = _$createElement("box")
      const _txt = _$createElement("text")
      _$insertNode(_box, _txt)
      _$setProp(_box, "paddingLeft", 1)
      _$setProp(_box, "paddingTop", 1)
      _$insert(_txt, "No tasks yet")
      _$effect(_$p => {
        _$p.e = _$setProp(_txt, "fg", props.theme.textMuted, _$p.e)
        return _$p
      }, { e: undefined })
      return [_box]
    }

    const items: any[] = []

    // Helper to create task row
    const mkRow = (t: Task, iconFg: any) => {
      const _row = _$createElement("box")
      const _icon = _$createElement("text")
      const _title = _$createElement("text")
      const _time = _$createElement("text")
      _$insertNode(_row, _icon)
      _$insertNode(_row, _title)
      _$insertNode(_row, _time)
      _$setProp(_row, "width", "100%")
      _$setProp(_row, "flexDirection", "row")
      _$setProp(_row, "paddingLeft", 1)
      _$setProp(_row, "paddingRight", 1)
      _$setProp(_row, "justifyContent", "space-between")
      _$setProp(_title, "flexGrow", 1)
      _$setProp(_title, "flexBasis", 0)
      _$setProp(_row, "justifyContent", "space-between")
      _$setProp(_row, "onMouseDown", () => handleTaskClick(t))
      _$insert(_icon, getStatusIcon(t.status))
      _$insert(_title, t.title.substring(0, 20))
      _$insert(_time, formatRelativeTime(t.updatedAt))
      _$effect(_$p => {
        _$p.e = _$setProp(_icon, "fg", iconFg, _$p.e)
        _$p.t = _$setProp(_title, "fg", props.theme.text, _$p.t)
        _$p.a = _$setProp(_time, "fg", props.theme.textMuted, _$p.a)
        return _$p
      }, { e: undefined, t: undefined, a: undefined })
      return _row
    }

    // Running tasks
    for (const t of runTasks) items.push(mkRow(t, props.theme.warning))

    // Completed section
    if (compTasks.length > 0) {
      items.push(_$createComponent(SectionHeader, { theme: props.theme, title: "Completed" }))
      for (const t of compTasks.slice(0, 5)) items.push(mkRow(t, props.theme.success))
    }

    // Failed section
    if (failTasks.length > 0) {
      items.push(_$createComponent(SectionHeader, { theme: props.theme, title: "Failed" }))
      for (const t of failTasks.slice(0, 5)) items.push(mkRow(t, props.theme.error))
    }

    return items
  })

  // --- Reactive props via _$effect (theme-dependent colors) ---

  _$effect(_$p => {
    _$p.e = _$setProp(_root, "borderColor", props.theme.borderActive, _$p.e)
    return _$p
  }, { e: undefined })

  _$effect(_$p => {
    _$p.e = _$setProp(_filterBtn, "backgroundColor", props.theme.accent, _$p.e)
    return _$p
  }, { e: undefined })

  _$effect(_$p => {
    _$p.e = _$setProp(_filterText, "fg", props.theme.background, _$p.e)
    return _$p
  }, { e: undefined })

  _$effect(_$p => {
    _$p.e = _$setProp(_versionText, "fg", props.theme.textMuted, _$p.e)
    return _$p
  }, { e: undefined })

  _$effect(_$p => {
    _$p.e = _$setProp(_runningText, "fg", props.theme.text, _$p.e)
    return _$p
  }, { e: undefined })

  return _root
})()

// ---- Slot registration ----

export function createSidebarContentSlot(api: any) {
  return {
    order: 150,
    slots: {
      sidebar_content: (ctx, value) => {
        const theme = createMemo(() => ctx.theme.current)
        return _$createComponent(TaskPanel, {
          api: api,
          sessionID: () => value.session_id,
          get theme() { return theme() },
        })
      },
    },
  }
}
