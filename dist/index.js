// @bun
var __require = import.meta.require;

// src/repo/Database.ts
import { Database as BunDatabase } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { homedir } from "os";
var __filename2 = fileURLToPath(import.meta.url);
var __dirname2 = dirname(__filename2);
var PLUGIN_ROOT = join(__dirname2, "..", "..");
var DATA_DIR = join(PLUGIN_ROOT, "data");
var DB_FILE = join(DATA_DIR, "tasks.db");
var CONFIG_FILE = join(homedir(), ".config", "opencode", "background-panel.jsonc");
var logLevel = "ERROR";
function btpLog(level, ...args) {
  const levels = ["DEBUG", "INFO", "ERROR"];
  const current = levels.indexOf(logLevel);
  const message = levels.indexOf(level);
  if (message >= current) {
    console.log("[BTP] [" + level + "]", ...args);
  }
}
function loadLogLevel() {
  try {
    if (existsSync(CONFIG_FILE)) {
      const content = readFileSync(CONFIG_FILE, "utf-8");
      const cleanContent = content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      const config = JSON.parse(cleanContent);
      logLevel = config.log_level || "ERROR";
    }
  } catch (e) {}
}
loadLogLevel();
var memoryStore = new Map;
var db = null;
function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
    btpLog("INFO", "Created data directory:", DATA_DIR);
  }
}
function initDb() {
  if (db)
    return;
  ensureDataDir();
  try {
    btpLog("DEBUG", "Initializing bun:sqlite...");
    if (existsSync(DB_FILE)) {
      btpLog("DEBUG", "Opening existing DB file");
      db = new BunDatabase(DB_FILE);
    } else {
      btpLog("INFO", "Creating new DB file");
      db = new BunDatabase(DB_FILE);
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
      `);
    }
    db.run("PRAGMA journal_mode=WAL");
    btpLog("DEBUG", "Journal mode:", db.query("PRAGMA journal_mode").get());
    btpLog("DEBUG", "bun:sqlite initialized successfully");
  } catch (e) {
    btpLog("ERROR", "InitDb error:", e?.message || e);
  }
}
function isProcessRunning(pid) {
  try {
    if (process.platform === "win32") {
      __require("child_process").execSync(`tasklist /FI "PID eq ${pid}" 2>nul`, { stdio: "pipe" });
      return true;
    } else {
      process.kill(pid, 0);
      return true;
    }
  } catch {
    return false;
  }
}
function loadTasks() {
  ensureDataDir();
  initDb();
  if (!db) {
    btpLog("ERROR", "DB not initialized after initDb() - using in-memory fallback");
    return;
  }
  memoryStore.clear();
  try {
    const stmt = db.prepare("SELECT * FROM tasks");
    const rows = stmt.all();
    let deletedCount = 0;
    for (const row of rows) {
      const task = {
        id: row.id,
        sessionId: row.sessionId,
        parentSessionId: row.parentSessionId,
        type: row.type,
        title: row.title,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        pid: row.pid
      };
      if (task.pid && task.status === "running") {
        if (!isProcessRunning(task.pid)) {
          btpLog("DEBUG", "Deleting orphaned task (PID", task.pid, "not running):", task.title);
          db.prepare("DELETE FROM tasks WHERE id = ?").run(task.id);
          deletedCount++;
          continue;
        }
      }
      memoryStore.set(task.id, task);
    }
    btpLog("INFO", "Loaded", memoryStore.size, "tasks from DB");
  } catch (e) {
    btpLog("ERROR", "Error loading tasks:", e);
  }
}
function getAllTasks() {
  return Array.from(memoryStore.values());
}
function getTask(id) {
  return memoryStore.get(id);
}
function setTask(task) {
  memoryStore.set(task.id, task);
  if (db) {
    try {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO tasks (id, sessionId, parentSessionId, type, title, status, createdAt, updatedAt, pid)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(task.id, task.sessionId, task.parentSessionId || null, task.type, task.title, task.status, task.createdAt, task.updatedAt, task.pid || null);
    } catch (e) {
      btpLog("ERROR", "setTask error:", e);
    }
  }
}

// src/server-plugin.ts
import { readFileSync as readFileSync2, existsSync as existsSync2, writeFileSync } from "fs";
import { fileURLToPath as fileURLToPath2 } from "url";
import { dirname as dirname2, join as join2 } from "path";
import { homedir as homedir2 } from "os";
var __filename3 = fileURLToPath2(import.meta.url);
var __dirname3 = dirname2(__filename3);
var CONFIG_FILE2 = join2(homedir2(), ".config", "opencode", "background-panel.jsonc");
var logLevel2 = "ERROR";
function btpLog2(level, ...args) {
  const levels = ["DEBUG", "INFO", "ERROR"];
  const current = levels.indexOf(logLevel2);
  const message = levels.indexOf(level);
  if (message >= current) {
    console.log("[BTP] [" + level + "]", ...args);
  }
}
var skipTaskPatterns = [];
function loadConfig() {
  try {
    if (!existsSync2(CONFIG_FILE2)) {
      btpLog2("INFO", "Config file not found, creating default at", CONFIG_FILE2);
      const defaultConfig = `{
// Log level: DEBUG, INFO, or ERROR (default: ERROR)
"log_level": "ERROR",

// Skip task patterns - titles matching these regex patterns will be skipped
// Examples:
//   "magic-context-compartment" - skip magic context compartments
//   "^test" - skip tasks starting with "test"
//   ".*ignore.*" - skip tasks containing "ignore"
"skip_tasks": [],

// Data directory - managed by the plugin, do not edit
"data_dir": "${DATA_DIR.replace(/\\/g, "\\\\")}",
"db_file": "${DB_FILE.replace(/\\/g, "\\\\")}"
}
`;
      try {
        writeFileSync(CONFIG_FILE2, defaultConfig, "utf-8");
      } catch (e) {
        btpLog2("ERROR", "Failed to create config file:", e);
      }
      skipTaskPatterns = [];
      return;
    }
    const content = readFileSync2(CONFIG_FILE2, "utf-8");
    const cleanContent = content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const config = JSON.parse(cleanContent);
    logLevel2 = config.log_level || "ERROR";
    const patterns = config.skip_tasks || [];
    skipTaskPatterns = patterns.map((p) => new RegExp(p));
    btpLog2("INFO", "Loaded config, log level:", logLevel2, ", skip patterns:", patterns);
    if (!config.data_dir || config.data_dir !== DATA_DIR) {
      try {
        const updatedConfig = { ...config, data_dir: DATA_DIR, db_file: DB_FILE };
        const newContent = JSON.stringify(updatedConfig, null, 2);
        writeFileSync(CONFIG_FILE2, newContent, "utf-8");
        btpLog2("INFO", "Updated config with data_dir:", DATA_DIR);
      } catch (e) {
        btpLog2("ERROR", "Failed to update config with data_dir:", e);
      }
    }
  } catch (e) {
    btpLog2("ERROR", "Config load error:", e);
    skipTaskPatterns = [];
  }
}
function shouldSkipTask(title) {
  for (const pattern of skipTaskPatterns) {
    if (pattern.test(title)) {
      return true;
    }
  }
  return false;
}
loadConfig();
btpLog2("INFO", "Server plugin module loaded");
var pluginClient = null;
async function refreshRunningTasks() {
  const tasks = getAllTasks();
  const runningTasks = tasks.filter((t) => t.status === "running");
  if (runningTasks.length === 0) {
    btpLog2("INFO", "No running tasks to refresh");
    return;
  }
  btpLog2("DEBUG", "Refreshing", runningTasks.length, "running tasks via session.status() API...");
  const timeoutMs = 5000;
  let statusResult = null;
  try {
    statusResult = await Promise.race([
      pluginClient.session.status(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs))
    ]);
  } catch (e) {
    btpLog2("ERROR", "Session status API error:", e.message);
    return;
  }
  const statusData = statusResult?.data?.["200"] || {};
  const activeSessionIds = Object.keys(statusData);
  btpLog2("DEBUG", "Active sessions:", activeSessionIds);
  for (const task of runningTasks) {
    btpLog2("DEBUG", "Checking task:", task.sessionId, task.title);
    if (!activeSessionIds.includes(task.sessionId)) {
      btpLog2("DEBUG", "Session not in active list -> marking as FAILED:", task.sessionId);
      task.status = "failed";
      task.updatedAt = Date.now();
      setTask(task);
      continue;
    }
    const sessionStatus = statusData[task.sessionId];
    if (sessionStatus) {
      btpLog2("DEBUG", "Session status:", task.sessionId, sessionStatus.type);
      if (sessionStatus.type === "idle") {
        task.status = "completed";
        task.updatedAt = Date.now();
        setTask(task);
        btpLog2("DEBUG", "Task marked completed:", task.title);
      } else if (sessionStatus.type === "retry" && sessionStatus.attempt >= 3) {
        task.status = "failed";
        task.updatedAt = Date.now();
        setTask(task);
        btpLog2("DEBUG", "Task marked failed (retry):", task.title);
      }
    }
  }
}
async function handleEvent(event) {
  const { type, properties = {} } = event;
  btpLog2("INFO", "Event received:", type, "sessionID:", properties.sessionID);
  if (type === "session.created") {
    const sessionId = properties.sessionID || properties.info?.id;
    const title = properties.info?.title;
    const parentID = properties.info?.parentID;
    btpLog2("DEBUG", "=== SESSION.CREATED DEBUG ===");
    btpLog2("DEBUG", "Full event properties:", JSON.stringify(properties, null, 2));
    btpLog2("DEBUG", "sessionId:", sessionId);
    btpLog2("DEBUG", "title:", title);
    btpLog2("DEBUG", "parentID:", parentID);
    btpLog2("DEBUG", "==================================");
    if (shouldSkipTask(title)) {
      btpLog2("DEBUG", "Skipping task (matched skip pattern):", title);
      return;
    }
    if (!sessionId) {
      btpLog2("ERROR", "No sessionId in session.created event");
      return;
    }
    if (!parentID) {
      btpLog2("DEBUG", "NOT creating task - no parentID. Title:", title);
      return;
    }
    btpLog2("INFO", "Creating task for subagent session...");
    const task = {
      id: sessionId,
      sessionId,
      parentSessionId: parentID,
      type: "session_create",
      title: title || "Unknown Task",
      status: "running",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pid: process.pid
    };
    setTask(task);
    btpLog2("INFO", "Task created:", task.id, task.title, "parent:", parentID || "none");
  } else if (type === "session.idle") {
    const sessionId = properties.sessionID;
    const title = properties.info?.title;
    btpLog2("DEBUG", "session.idle for session:", sessionId, "title:", title);
    if (!sessionId) {
      btpLog2("ERROR", "No sessionID in session.idle event");
      return;
    }
    const task = getTask(sessionId);
    if (task) {
      if (task.status === "running") {
        task.status = "completed";
        task.updatedAt = Date.now();
        setTask(task);
        btpLog2("INFO", "Task completed via session.idle:", task.id, task.title);
      } else {
        btpLog2("DEBUG", "Task not in running state:", task.status);
      }
    } else {
      btpLog2("ERROR", "Task not found for session.idle:", sessionId);
    }
  } else if (type === "session.status") {
    const sessionId = properties.sessionID;
    const status = properties.status;
    btpLog2("DEBUG", "session.status for session:", sessionId, "status:", JSON.stringify(status));
    if (!sessionId)
      return;
    const task = getTask(sessionId);
    if (!task)
      return;
    const statusType = status?.type;
    if (statusType === "idle") {
      if (task.status === "running") {
        task.status = "completed";
        task.updatedAt = Date.now();
        setTask(task);
        btpLog2("INFO", "Task completed via session.status:", task.id, task.title);
      }
    } else if (statusType === "retry" && status.attempt >= 3) {
      if (task.status === "running") {
        task.status = "failed";
        task.updatedAt = Date.now();
        setTask(task);
        btpLog2("INFO", "Task failed via session.status (\u591A\u6B21\u91CD\u8BD5):", task.id, task.title);
      }
    }
  } else if (type === "session.error") {
    const sessionId = properties.sessionID;
    if (!sessionId) {
      btpLog2("ERROR", "No sessionID in session.error event");
      return;
    }
    btpLog2("ERROR", "session.error for session:", sessionId);
    const task = getTask(sessionId);
    if (task) {
      task.status = "failed";
      task.updatedAt = Date.now();
      setTask(task);
      btpLog2("ERROR", "Task failed:", task.id, task.title);
    }
  } else {
    btpLog2("DEBUG", "Unhandled event type:", type);
  }
}
var serverPlugin = async (input) => {
  btpLog2("INFO", "Server plugin starting with Hooks pattern...");
  pluginClient = input.client;
  btpLog2("INFO", "Client available:", !!pluginClient);
  loadTasks();
  refreshRunningTasks().catch((e) => btpLog2("ERROR", "Refresh error:", e.message));
  return {
    event: async ({ event }) => {
      await handleEvent(event);
    }
  };
};
var server_plugin_default = serverPlugin;

// src/index.ts
var src_default = {
  id: "opencode-background-panel",
  server: server_plugin_default
};
export {
  src_default as default
};
