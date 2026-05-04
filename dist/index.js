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
"skip_tasks": []
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

// src/tui/slots/sidebar-content.tsx
import { createSignal, createMemo, createEffect, onCleanup } from "solid-js";
import { Database as BunSqlite } from "bun:sqlite";
import { fileURLToPath as fileURLToPath3 } from "url";
import { dirname as dirname3, join as join3 } from "path";
import { homedir as homedir3 } from "os";
import { existsSync as existsSync3, readFileSync as readFileSync3 } from "fs";
import { jsxDEV, Fragment } from "@opentui/solid/jsx-dev-runtime";
var SINGLE_BORDER = { type: "single" };
var TIME_UPDATE_INTERVAL_MS = 500;
var POLL_INTERVAL_MS = 1000;
var __filename4 = fileURLToPath3(import.meta.url);
var __dirname4 = dirname3(__filename4);
var PLUGIN_ROOT2 = join3(__dirname4, "..", "..", "..");
var DATA_DIR2 = join3(PLUGIN_ROOT2, "data");
var DB_FILE2 = join3(DATA_DIR2, "tasks.db");
var CONFIG_FILE3 = join3(homedir3(), ".config", "opencode", "background-panel.jsonc");
var logLevel3 = "ERROR";
function btpLog3(level, ...args) {
  const levels = ["DEBUG", "INFO", "ERROR"];
  const current = levels.indexOf(logLevel3);
  const message = levels.indexOf(level);
  if (message >= current) {
    console.log("[BTP] [" + level + "]", ...args);
  }
}
function loadConfig2() {
  try {
    if (existsSync3(CONFIG_FILE3)) {
      const content = readFileSync3(CONFIG_FILE3, "utf-8");
      const cleanContent = content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      const config = JSON.parse(cleanContent);
      logLevel3 = config.log_level || "ERROR";
    }
  } catch (e) {}
}
loadConfig2();
async function readTasksFromDb() {
  try {
    const fs = await import("fs");
    btpLog3("DEBUG", "DB_FILE path:", DB_FILE2);
    btpLog3("DEBUG", "DB_FILE exists:", fs.existsSync(DB_FILE2));
    if (!fs.existsSync(DB_FILE2)) {
      btpLog3("DEBUG", "DB file not found, returning cached tasks:", cachedTasks.length);
      return cachedTasks.length > 0 ? cachedTasks : [];
    }
    const stat = fs.statSync(DB_FILE2);
    btpLog3("DEBUG", "DB file size:", stat.size, "bytes");
    const db2 = new BunSqlite(DB_FILE2);
    const tasks = [];
    const rows = db2.query("SELECT * FROM tasks ORDER BY updatedAt DESC").all();
    btpLog3("DEBUG", "Query returned", rows.length, "rows");
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
      });
    }
    db2.close();
    btpLog3("DEBUG", "TUI: Read", tasks.length, "tasks from DB");
    cachedTasks = tasks;
    btpLog3("DEBUG", "TUI: Cache updated with", tasks.length, "tasks");
    return tasks;
  } catch (e) {
    btpLog3("ERROR", "TUI read error:", e);
    return cachedTasks.length > 0 ? cachedTasks : [];
  }
}
var cachedTasks = [];
function formatRelativeTime(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60)
    return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
function getStatusIcon(status) {
  switch (status) {
    case "running":
      return "\u25B6";
    case "completed":
      return "\u2713";
    case "failed":
      return "\u2717";
    case "pending":
      return "\u25CB";
    default:
      return "?";
  }
}
var StatRow = (props) => /* @__PURE__ */ jsxDEV("box", {
  width: "100%",
  flexDirection: "row",
  justifyContent: "space-between",
  children: [
    /* @__PURE__ */ jsxDEV("text", {
      fg: props.theme.text,
      children: props.label
    }, undefined, false, undefined, this),
    /* @__PURE__ */ jsxDEV("text", {
      fg: props.dim ? props.theme.textMuted : props.accent ? props.theme.accent : props.theme.text,
      children: props.value
    }, undefined, false, undefined, this)
  ]
}, undefined, true, undefined, this);
var SectionHeader = (props) => /* @__PURE__ */ jsxDEV("box", {
  width: "100%",
  marginTop: 1,
  flexDirection: "row",
  justifyContent: "space-between",
  children: /* @__PURE__ */ jsxDEV("text", {
    fg: props.theme.text,
    children: /* @__PURE__ */ jsxDEV("b", {
      children: props.title
    }, undefined, false, undefined, this)
  }, undefined, false, undefined, this)
}, undefined, false, undefined, this);
var TaskPanel = (props) => {
  const [snapshot, setSnapshot] = createSignal([]);
  const [filterMode, setFilterMode] = createSignal("session");
  let timeUpdateTimer;
  let pollTimer;
  createEffect(() => {
    btpLog3("DEBUG", "TUI panel mounting, starting poll...");
    readTasksFromDb().then((tasks) => {
      setSnapshot(tasks);
      btpLog3("DEBUG", "Initial tasks loaded:", tasks.length);
    });
    pollTimer = setInterval(async () => {
      const tasks = await readTasksFromDb();
      setSnapshot(tasks);
    }, POLL_INTERVAL_MS);
    timeUpdateTimer = setInterval(() => {
      props.api.renderer.requestRender();
    }, TIME_UPDATE_INTERVAL_MS);
  });
  onCleanup(() => {
    if (timeUpdateTimer)
      clearInterval(timeUpdateTimer);
    if (pollTimer)
      clearInterval(pollTimer);
    btpLog3("DEBUG", "TUI panel unmounting, stopped polling");
  });
  const handleTaskClick = (task) => {
    btpLog3("DEBUG", "Navigating to task session:", task.sessionId);
    props.api.route.navigate("session", { sessionID: task.sessionId });
  };
  const toggleFilter = () => {
    setFilterMode((prev) => prev === "all" ? "session" : "all");
    btpLog3("DEBUG", "Filter mode:", filterMode());
  };
  const filteredTasks = createMemo(() => {
    const mode = filterMode();
    const currentSession = props.sessionID();
    const tasks = snapshot();
    btpLog3("DEBUG", "Filter mode:", mode, "currentSession:", currentSession, "total tasks:", tasks.length);
    if (mode === "session") {
      const filtered = tasks.filter((t) => t.parentSessionId === currentSession || t.sessionId === currentSession);
      btpLog3("DEBUG", "Session filtered:", filtered.length, "tasks");
      return filtered;
    }
    return tasks;
  });
  const runningTasks = createMemo(() => filteredTasks().filter((t) => t.status === "running"));
  const completedTasks = createMemo(() => filteredTasks().filter((t) => t.status === "completed"));
  const failedTasks = createMemo(() => filteredTasks().filter((t) => t.status === "failed"));
  return /* @__PURE__ */ jsxDEV("box", {
    width: "100%",
    flexDirection: "column",
    border: SINGLE_BORDER,
    borderColor: props.theme.borderActive,
    paddingTop: 1,
    paddingBottom: 1,
    paddingLeft: 1,
    paddingRight: 1,
    children: [
      /* @__PURE__ */ jsxDEV("box", {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        children: [
          /* @__PURE__ */ jsxDEV("box", {
            paddingLeft: 1,
            paddingRight: 1,
            backgroundColor: props.theme.accent,
            onMouseDown: toggleFilter,
            children: /* @__PURE__ */ jsxDEV("text", {
              fg: props.theme.background,
              children: /* @__PURE__ */ jsxDEV("b", {
                children: [
                  "Tasks ",
                  filterMode() === "session" ? "[Session]" : "[All]"
                ]
              }, undefined, true, undefined, this)
            }, undefined, false, undefined, this)
          }, undefined, false, undefined, this),
          /* @__PURE__ */ jsxDEV("text", {
            fg: props.theme.textMuted,
            children: "v0.2.3"
          }, undefined, false, undefined, this)
        ]
      }, undefined, true, undefined, this),
      /* @__PURE__ */ jsxDEV("box", {
        width: "100%",
        marginTop: 1,
        flexDirection: "row",
        justifyContent: "space-between",
        children: [
          /* @__PURE__ */ jsxDEV("text", {
            fg: props.theme.text,
            children: /* @__PURE__ */ jsxDEV("b", {
              children: "Running"
            }, undefined, false, undefined, this)
          }, undefined, false, undefined, this),
          runningTasks().length > 0 ? /* @__PURE__ */ jsxDEV("text", {
            fg: props.theme.warning,
            children: [
              runningTasks().length,
              " active"
            ]
          }, undefined, true, undefined, this) : /* @__PURE__ */ jsxDEV("text", {
            fg: props.theme.textMuted,
            children: "idle"
          }, undefined, false, undefined, this)
        ]
      }, undefined, true, undefined, this),
      /* @__PURE__ */ jsxDEV("box", {
        flexDirection: "column",
        width: "100%",
        children: runningTasks().length === 0 && completedTasks().length === 0 && failedTasks().length === 0 ? /* @__PURE__ */ jsxDEV("box", {
          paddingLeft: 1,
          paddingTop: 1,
          children: /* @__PURE__ */ jsxDEV("text", {
            fg: props.theme.textMuted,
            children: "No tasks yet"
          }, undefined, false, undefined, this)
        }, undefined, false, undefined, this) : /* @__PURE__ */ jsxDEV(Fragment, {
          children: [
            runningTasks().map((task) => /* @__PURE__ */ jsxDEV("box", {
              width: "100%",
              flexDirection: "row",
              paddingLeft: 1,
              paddingRight: 1,
              onMouseDown: () => handleTaskClick(task),
              children: [
                /* @__PURE__ */ jsxDEV("text", {
                  fg: props.theme.warning,
                  children: getStatusIcon(task.status)
                }, undefined, false, undefined, this),
                /* @__PURE__ */ jsxDEV("text", {
                  fg: props.theme.text,
                  marginLeft: 1,
                  width: 25,
                  children: task.title.substring(0, 20)
                }, undefined, false, undefined, this),
                /* @__PURE__ */ jsxDEV("text", {
                  fg: props.theme.textMuted,
                  children: formatRelativeTime(task.updatedAt)
                }, undefined, false, undefined, this)
              ]
            }, task.id, true, undefined, this)),
            completedTasks().length > 0 && /* @__PURE__ */ jsxDEV(Fragment, {
              children: [
                /* @__PURE__ */ jsxDEV(SectionHeader, {
                  theme: props.theme,
                  title: "Completed"
                }, undefined, false, undefined, this),
                completedTasks().slice(0, 5).map((task) => /* @__PURE__ */ jsxDEV("box", {
                  width: "100%",
                  flexDirection: "row",
                  paddingLeft: 1,
                  paddingRight: 1,
                  onMouseDown: () => handleTaskClick(task),
                  children: [
                    /* @__PURE__ */ jsxDEV("text", {
                      fg: props.theme.success,
                      children: getStatusIcon(task.status)
                    }, undefined, false, undefined, this),
                    /* @__PURE__ */ jsxDEV("text", {
                      fg: props.theme.textMuted,
                      marginLeft: 1,
                      width: 25,
                      children: task.title.substring(0, 20)
                    }, undefined, false, undefined, this),
                    /* @__PURE__ */ jsxDEV("text", {
                      fg: props.theme.textMuted,
                      children: formatRelativeTime(task.updatedAt)
                    }, undefined, false, undefined, this)
                  ]
                }, task.id, true, undefined, this))
              ]
            }, undefined, true, undefined, this),
            failedTasks().length > 0 && /* @__PURE__ */ jsxDEV(Fragment, {
              children: [
                /* @__PURE__ */ jsxDEV(SectionHeader, {
                  theme: props.theme,
                  title: "Failed"
                }, undefined, false, undefined, this),
                failedTasks().slice(0, 5).map((task) => /* @__PURE__ */ jsxDEV("box", {
                  width: "100%",
                  flexDirection: "row",
                  paddingLeft: 1,
                  paddingRight: 1,
                  onMouseDown: () => handleTaskClick(task),
                  children: [
                    /* @__PURE__ */ jsxDEV("text", {
                      fg: props.theme.error,
                      children: getStatusIcon(task.status)
                    }, undefined, false, undefined, this),
                    /* @__PURE__ */ jsxDEV("text", {
                      fg: props.theme.textMuted,
                      marginLeft: 1,
                      width: 25,
                      children: task.title.substring(0, 20)
                    }, undefined, false, undefined, this),
                    /* @__PURE__ */ jsxDEV("text", {
                      fg: props.theme.textMuted,
                      children: formatRelativeTime(task.updatedAt)
                    }, undefined, false, undefined, this)
                  ]
                }, task.id, true, undefined, this))
              ]
            }, undefined, true, undefined, this)
          ]
        }, undefined, true, undefined, this)
      }, undefined, false, undefined, this),
      /* @__PURE__ */ jsxDEV("box", {
        width: "100%",
        marginTop: 1,
        border: { top: { style: "single" } },
        paddingTop: 1,
        children: [
          /* @__PURE__ */ jsxDEV(StatRow, {
            theme: props.theme,
            label: "Total",
            value: String(filteredTasks().length)
          }, undefined, false, undefined, this),
          /* @__PURE__ */ jsxDEV(StatRow, {
            theme: props.theme,
            label: "Completed",
            value: String(completedTasks().length),
            dim: true
          }, undefined, false, undefined, this),
          /* @__PURE__ */ jsxDEV(StatRow, {
            theme: props.theme,
            label: "Failed",
            value: String(failedTasks().length),
            dim: true
          }, undefined, false, undefined, this)
        ]
      }, undefined, true, undefined, this)
    ]
  }, undefined, true, undefined, this);
};
function createSidebarContentSlot(api) {
  return {
    order: 150,
    slots: {
      sidebar_content: (ctx, value) => {
        const theme = createMemo(() => ctx.theme.current);
        return /* @__PURE__ */ jsxDEV(TaskPanel, {
          api,
          sessionID: () => value.session_id,
          theme: theme()
        }, undefined, false, undefined, this);
      }
    }
  };
}

// src/tui/index.tsx
var id = "opencode-background-panel";
var tui = async (api, _options, _meta) => {
  console.log("[BTP] TUI plugin loading...");
  console.log("[BTP] API keys:", Object.keys(api));
  console.log("[BTP] API slots:", typeof api.slots);
  console.log("[BTP] API version:", _meta?.version);
  const slot = createSidebarContentSlot(api);
  console.log("[BTP] Slot created with id:", slot.id);
  console.log("[BTP] Slot slots:", Object.keys(slot.slots));
  api.slots.register(slot);
  console.log("[BTP] TUI plugin registered successfully");
};
var tui_default = {
  id,
  tui
};

// src/index.ts
var id2 = "opencode-background-panel";
var tui2 = tui_default;
var src_default = {
  id: id2,
  server: server_plugin_default,
  tui: tui2
};
export {
  src_default as default
};
