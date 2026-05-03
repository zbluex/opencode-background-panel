// Task Repository - File-based storage for cross-session task data
// Server Plugin writes here, TUI Plugin reads from here (via polling)

// In-memory store for Server Plugin (fast access)
// + File persistence for TUI Plugin to read across sessions

import type { Task, ITaskRepository } from "../shared/types"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"

const DATA_DIR = "C:/Users/zbluex/.config/opencode/plugins/background-task-panel/data"
const TASKS_FILE = `${DATA_DIR}/tasks.json`

// In-memory store for server-side fast access
const memoryStore = new Map<string, Task>()

// Initialize data directory
function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
    console.log("[BTP] Created data directory:", DATA_DIR)
  }
}

export class TaskRepository implements ITaskRepository {
  async insert(task: Task): Promise<void> {
    console.log("[BTP] TaskRepository.insert:", task.id, task.title)
    memoryStore.set(task.id, task)
    await this.persist()
  }

  async update(task: Task): Promise<void> {
    console.log("[BTP] TaskRepository.update:", task.id, task.status)
    memoryStore.set(task.id, task)
    await this.persist()
  }

  async findById(id: string): Promise<Task | null> {
    return memoryStore.get(id) || null
  }

  async findAll(): Promise<Task[]> {
    return Array.from(memoryStore.values()).sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async findSince(timestamp: number): Promise<Task[]> {
    return Array.from(memoryStore.values())
      .filter(t => t.updatedAt > timestamp)
      .sort((a, b) => a.updatedAt - b.updatedAt)
  }

  async delete(id: string): Promise<void> {
    memoryStore.delete(id)
    await this.persist()
  }

  // Persist to JSON file for TUI plugin to read
  private async persist(): Promise<void> {
    ensureDataDir()
    const data = {
      tasks: Array.from(memoryStore.values()),
      lastUpdate: Date.now()
    }
    try {
      writeFileSync(TASKS_FILE, JSON.stringify(data, null, 2), "utf-8")
      console.log("[BTP] Persisted", memoryStore.size, "tasks to", TASKS_FILE)
    } catch (e) {
      console.log("[BTP] Persist error:", e)
    }
  }

  // Load from file (for TUI plugin)
  static loadFromFile(): { tasks: Task[]; lastUpdate: number } {
    try {
      if (existsSync(TASKS_FILE)) {
        const content = readFileSync(TASKS_FILE, "utf-8")
        return JSON.parse(content)
      }
    } catch (e) {
      console.log("[BTP] Failed to load tasks from file:", e)
    }
    return { tasks: [], lastUpdate: 0 }
  }
}

// Singleton for server plugin
let serverRepo: TaskRepository | null = null

export function getTaskRepository(): TaskRepository {
  if (!serverRepo) {
    console.log("[BTP] Creating new TaskRepository")
    serverRepo = new TaskRepository()
  }
  return serverRepo
}