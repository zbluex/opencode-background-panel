// Shared types for Background Task Panel - dual plugin architecture
// Used by both Server Plugin and TUI Plugin

export interface Task {
  id: string
  sessionId: string
  type: "session_create" | "session_complete" | "error"
  title: string
  status: "running" | "pending" | "completed" | "failed"
  createdAt: number
  updatedAt: number
  metadata?: Record<string, unknown>
}

export interface TaskEvent {
  type: "created" | "progress" | "completed" | "error"
  taskId: string
  timestamp: number
  payload?: Record<string, unknown>
}

export interface ITaskServerPlugin {
  getTasks(since?: number): Promise<Task[]>
  getTask(id: string): Promise<Task | null>
}

export interface ITaskRepository {
  insert(task: Task): Promise<void>
  update(task: Task): Promise<void>
  findById(id: string): Promise<Task | null>
  findAll(): Promise<Task[]>
  findSince(timestamp: number): Promise<Task[]>
  delete(id: string): Promise<void>
}