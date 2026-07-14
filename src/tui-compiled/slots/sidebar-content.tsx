import { createElement as _$createElement } from "opentui:runtime-module:%40opentui%2Fsolid"
import { createComponent as _$createComponent } from "opentui:runtime-module:%40opentui%2Fsolid"
import { setProp as _$setProp } from "opentui:runtime-module:%40opentui%2Fsolid"
import { insert as _$insert } from "opentui:runtime-module:%40opentui%2Fsolid"
import { createTextNode as _$createTextNode } from "opentui:runtime-module:%40opentui%2Fsolid"
import { memo as _$memo } from "opentui:runtime-module:%40opentui%2Fsolid"
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
const PLUGIN_ROOT_FALLBACK = join(__dirname, "..", "..", "..")
const DATA_DIR_FALLBACK = join(PLUGIN_ROOT_FALLBACK, "data")
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

// ---- Element helpers ----

function createTextEl(fg: any, ...content: any[]) {
  const el = _$createElement("text")
  if (fg !== undefined) _$setProp(el, "fg", fg)
  for (const item of content) {
    if (typeof item === "function") _$insert(el, item)
    else _$insert(el, item)
  }
  return el
}

function createBoldTextEl(fg: any, text: string) {
  const b = _$createElement("b")
  _$insert(b, text)
  const el = _$createElement("text")
  if (fg !== undefined) _$setProp(el, "fg", fg)
  _$insert(el, b)
  return el
}

function createBoxEl(props: Record<string, any>, ...children: any[]) {
  const el = _$createElement("box")
  for (const [k, v] of Object.entries(props)) {
    _$setProp(el, k, v)
  }
  for (const child of children) {
    if (child !== null && child !== undefined) {
      _$insert(el, child)
    }
  }
  return el
}

function createTaskRowEl(task: Task, fg: string, theme: any, onClick: (t: Task) => void) {
  return createBoxEl(
    { key: task.id, width: "100%", flexDirection: "row", paddingLeft: 1, paddingRight: 1, onMouseDown: () => onClick(task) },
    createTextEl(fg, getStatusIcon(task.status)),
    createTextEl(theme.text, task.title.substring(0, 20)),
    createTextEl(theme.textMuted, formatRelativeTime(task.updatedAt))
  )
}

// ---- Components ----

const StatRow = (props: { theme: any; label: string; value: string; accent?: boolean; dim?: boolean }) => {
  const _el = _$createElement("box")
  _$setProp(_el, "width", "100%")
  _$setProp(_el, "flexDirection", "row")
  _$setProp(_el, "justifyContent", "space-between")
  
  const _label = _$createElement("text")
  _$setProp(_label, "fg", () => props.theme.text)
  _$insert(_label, () => props.label)
  
  const _value = _$createElement("text")
  _$setProp(_value, "fg", () =>
    props.dim ? props.theme.textMuted
      : props.accent ? props.theme.accent
        : props.theme.text
  )
  _$insert(_value, () => props.value)
  
  _$insert(_el, _label)
  _$insert(_el, _value)
  return _el
}

const SectionHeader = (props: { theme: any; title: string }) => {
  const _el = _$createElement("box")
  _$setProp(_el, "width", "100%")
  _$setProp(_el, "marginTop", 1)
  _$setProp(_el, "flexDirection", "row")
  _$setProp(_el, "justifyContent", "space-between")
  
  const _b = _$createElement("b")
  _$insert(_b, props.title)
  
  const _text = _$createElement("text")
  _$setProp(_text, "fg", props.theme.text)
  _$insert(_text, _b)
  
  _$insert(_el, _text)
  return _el
}

const TaskPanel = (props: { api: any; sessionID: () => string; theme: any }) => {
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

  // Build the main container
  const _root = _$createElement("box")
  _$setProp(_root, "width", "100%")
  _$setProp(_root, "flexDirection", "column")
  _$setProp(_root, "border", SINGLE_BORDER)
  _$setProp(_root, "borderColor", () => props.theme.borderActive)
  _$setProp(_root, "paddingTop", 1)
  _$setProp(_root, "paddingBottom", 1)
  _$setProp(_root, "paddingLeft", 1)
  _$setProp(_root, "paddingRight", 1)

  // Header row: filter button + version
  const _headerRow = _$createElement("box")
  _$setProp(_headerRow, "flexDirection", "row")
  _$setProp(_headerRow, "justifyContent", "space-between")
  _$setProp(_headerRow, "alignItems", "center")

  const _filterBtn = _$createElement("box")
  _$setProp(_filterBtn, "paddingLeft", 1)
  _$setProp(_filterBtn, "paddingRight", 1)
  _$setProp(_filterBtn, "backgroundColor", () => props.theme.accent)
  _$setProp(_filterBtn, "onMouseDown", toggleFilter)
  
  const _filterText = _$createElement("text")
  _$setProp(_filterText, "fg", () => props.theme.background)
  const _filterBold = _$createElement("b")
  _$insert(_filterBold, () => "Tasks " + (filterMode() === "session" ? "[Session]" : "[All]"))
  _$insert(_filterText, _filterBold)
  _$insert(_filterBtn, _filterText)

  const _versionText = _$createElement("text")
  _$setProp(_versionText, "fg", () => props.theme.textMuted)
  _$insert(_versionText, "v" + packageJson.version)

  _$insert(_headerRow, _filterBtn)
  _$insert(_headerRow, _versionText)

  // Stats row
  const _statsRow = _$createElement("box")
  _$setProp(_statsRow, "width", "100%")
  _$setProp(_statsRow, "marginTop", 1)
  _$setProp(_statsRow, "flexDirection", "row")
  _$setProp(_statsRow, "justifyContent", "space-between")
  _$setProp(_statsRow, "alignItems", "center")

  const statEls = [
    createTextEl(() => props.theme.textMuted, "\uD83D\uDCCA T:" + filteredTasks().length),
    createTextEl(() => props.theme.warning, "\u25B6 R:" + runningTasks().length),
    createTextEl(() => props.theme.success, "\u2713 C:" + completedTasks().length),
    createTextEl(() => props.theme.error, "\u2717 F:" + failedTasks().length),
  ]
  for (const s of statEls) _$insert(_statsRow, s)

  // Running section header
  const _runningSection = _$createElement("box")
  _$setProp(_runningSection, "width", "100%")
  _$setProp(_runningSection, "marginTop", 1)
  _$setProp(_runningSection, "flexDirection", "row")
  _$setProp(_runningSection, "justifyContent", "space-between")

  _$insert(_runningSection, createBoldTextEl(() => props.theme.text, "Running"))
  _$insert(_runningSection, () =>
    runningTasks().length > 0
      ? _$createElement("text", null, runningTasks().length + " active")
      : createTextEl(() => props.theme.textMuted, "idle")
  )

  // Task list container (all running/completed/failed items)
  const _taskList = _$createElement("box")
  _$setProp(_taskList, "flexDirection", "column")
  _$setProp(_taskList, "width", "100%")

  // Reactive content: all task items
  _$insert(_taskList, () => {
    if (runningTasks().length === 0 && completedTasks().length === 0 && failedTasks().length === 0) {
      return createBoxEl({ paddingLeft: 1, paddingTop: 1 },
        createTextEl(() => props.theme.textMuted, "No tasks yet")
      )
    }
    const items: any[] = []
    // Running
    for (const t of runningTasks()) {
      items.push(createTaskRowEl(t, props.theme.warning, props.theme, handleTaskClick))
    }
    // Completed
    if (completedTasks().length > 0) {
      items.push(_$createComponent(SectionHeader, { theme: props.theme, title: "Completed" }))
      for (const t of completedTasks().slice(0, 5)) {
        items.push(createTaskRowEl(t, props.theme.success, props.theme, handleTaskClick))
      }
    }
    // Failed
    if (failedTasks().length > 0) {
      items.push(_$createComponent(SectionHeader, { theme: props.theme, title: "Failed" }))
      for (const t of failedTasks().slice(0, 5)) {
        items.push(createTaskRowEl(t, props.theme.error, props.theme, handleTaskClick))
      }
    }
    return items
  })

  // Assemble root
  _$insert(_root, _headerRow)
  _$insert(_root, _statsRow)
  _$insert(_root, _runningSection)
  _$insert(_root, _taskList)

  return _root
}

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
