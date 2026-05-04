// Database module - SQLite storage using bun:sqlite for multi-process access
// bun:sqlite is built into Bun runtime and supports WAL mode for concurrent access

import { Database as BunDatabase } from "bun:sqlite"
import { existsSync, mkdirSync, readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { homedir } from "os"

// Derive data directory relative to this file's location
// This avoids hardcoded user paths and makes the plugin portable
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PLUGIN_ROOT = join(__dirname, "..", "..")
export const DATA_DIR = join(PLUGIN_ROOT, "data")
export const DB_FILE = join(DATA_DIR, "tasks.db")
const CONFIG_FILE = join(homedir(), ".config", "opencode", "background-panel.jsonc")

// Log level: DEBUG > INFO > ERROR
type LogLevel = "DEBUG" | "INFO" | "ERROR" | "NONE"
let logLevel: LogLevel = "NONE"

function btpLog(level: LogLevel, ...args: any[]): void {
  const levels: LogLevel[] = ["DEBUG", "INFO", "ERROR"]
  const current = levels.indexOf(logLevel)
  const message = levels.indexOf(level)
  if (message >= current) {
    console.log("[BTP] [" + level + "]", ...args)
  }
}

// Load log level from config
function loadLogLevel(): void {
  try {
    if (existsSync(CONFIG_FILE)) {
      const content = readFileSync(CONFIG_FILE, "utf-8")
      const cleanContent = content
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
      const config = JSON.parse(cleanContent)
      logLevel = (config.log_level as LogLevel) || "NONE"
    }
  } catch (e) {
    // Use default ERROR level
  }
}

loadLogLevel()

// Task interface
export interface Task {
  id: string
  sessionId: string
  parentSessionId?: string  // Parent session that created this subagent
  type: "session_create" | "session_complete" | "error"
  title: string
  status: "running" | "pending" | "completed" | "failed"
  createdAt: number
  updatedAt: number
  pid?: number
}

// In-memory store (local to this process)
const memoryStore = new Map<string, Task>()

let db: BunDatabase | null = null

// Ensure data directory exists
function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
    btpLog("INFO", "Created data directory:", DATA_DIR)
  }
}

// Initialize database
function initDb(): void {
  if (db) return

  ensureDataDir()

  try {
    btpLog("DEBUG", "Initializing bun:sqlite...")

    if (existsSync(DB_FILE)) {
      btpLog("DEBUG", "Opening existing DB file")
      db = new BunDatabase(DB_FILE)
    } else {
      btpLog("INFO", "Creating new DB file")
      db = new BunDatabase(DB_FILE)
      db.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          sessionId TEXT NOT NULL,
          parentSessionId TEXT,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          status TEXT NOT NULL,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL,
          pid INTEGER
        )
      `)
    }

    // Enable WAL mode for better concurrency
    db.run("PRAGMA journal_mode=WAL")
    btpLog("DEBUG", "Journal mode:", db.query("PRAGMA journal_mode").get())

    btpLog("DEBUG", "bun:sqlite initialized successfully")
  } catch (e: any) {
    btpLog("ERROR", "InitDb error:", e?.message || e)
  }
}

// Check if process is running (Windows-compatible)
function isProcessRunning(pid: number): boolean {
  try {
    if (process.platform === "win32") {
      require("child_process").execSync(`tasklist /FI "PID eq ${pid}" 2>nul`, { stdio: "pipe" })
      return true
    } else {
      process.kill(pid, 0)
      return true
    }
  } catch {
    return false
  }
}

// Load tasks from DB
export function loadTasks(): void {
  ensureDataDir()
  initDb()

  if (!db) {
    btpLog("ERROR", "DB not initialized after initDb() - using in-memory fallback")
    return
  }

  memoryStore.clear()

  try {
    const stmt = db.prepare("SELECT * FROM tasks")
    const rows = stmt.all() as any[]

    let deletedCount = 0

    for (const row of rows) {
      const task: Task = {
        id: row.id,
        sessionId: row.sessionId,
        parentSessionId: row.parentSessionId,
        type: row.type,
        title: row.title,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        pid: row.pid
      }

      // Clean orphaned tasks
      if (task.pid && task.status === "running") {
        if (!isProcessRunning(task.pid)) {
          btpLog("DEBUG", "Deleting orphaned task (PID", task.pid, "not running):", task.title)
          db.prepare("DELETE FROM tasks WHERE id = ?").run(task.id)
          deletedCount++
          continue
        }
      }

      memoryStore.set(task.id, task)
    }

    btpLog("INFO", "Loaded", memoryStore.size, "tasks from DB")
  } catch (e) {
    btpLog("ERROR", "Error loading tasks:", e)
  }
}

// Get all tasks
export function getAllTasks(): Task[] {
  return Array.from(memoryStore.values())
}

// Get task by ID
export function getTask(id: string): Task | undefined {
  return memoryStore.get(id)
}

// Add or update task
export function setTask(task: Task): void {
  memoryStore.set(task.id, task)

  if (db) {
    try {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO tasks (id, sessionId, parentSessionId, type, title, status, createdAt, updatedAt, pid)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      stmt.run(
        task.id,
        task.sessionId,
        task.parentSessionId || null,
        task.type,
        task.title,
        task.status,
        task.createdAt,
        task.updatedAt,
        task.pid || null
      )
    } catch (e) {
      btpLog("ERROR", "setTask error:", e)
    }
  }
}

// Delete task
export function deleteTask(id: string): void {
  memoryStore.delete(id)
  if (db) {
    try {
      db.prepare("DELETE FROM tasks WHERE id = ?").run(id)
    } catch (e) {
      btpLog("ERROR", "deleteTask error:", e)
    }
  }
}

// Force sync from DB (reload from file)
export function syncFromDb(): void {
  loadTasks()
}

// Get DB for direct queries (for TUI plugin)
export function getDb(): BunDatabase | null {
  initDb()
  return db
}

// Query tasks directly (for TUI)
export function queryTasks(): Task[] {
  initDb()
  if (!db) return []

  try {
    const rows = db.prepare("SELECT * FROM tasks ORDER BY updatedAt DESC").all() as any[]
    return rows.map(row => ({
      id: row.id,
      sessionId: row.sessionId,
      parentSessionId: row.parentSessionId,
      type: row.type,
      title: row.title,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      pid: row.pid
    }))
  } catch (e) {
    btpLog("ERROR", "queryTasks error:", e)
    return []
  }
}

// Close database
export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}