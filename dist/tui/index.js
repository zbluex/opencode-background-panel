// @bun
var __require = import.meta.require;

// src/tui/slots/sidebar-content.tsx
import { createSignal, createMemo, createEffect, onCleanup } from "solid-js";
import { Database as BunSqlite } from "bun:sqlite";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { homedir } from "os";
import { existsSync, readFileSync } from "fs";
import { jsxDEV, Fragment } from "@opentui/solid/jsx-dev-runtime";
var SINGLE_BORDER = { type: "single" };
var TIME_UPDATE_INTERVAL_MS = 500;
var POLL_INTERVAL_MS = 1000;
var __filename2 = fileURLToPath(import.meta.url);
var __dirname2 = dirname(__filename2);
var PLUGIN_ROOT = join(__dirname2, "..", "..", "..");
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
function loadConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      const content = readFileSync(CONFIG_FILE, "utf-8");
      const cleanContent = content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      const config = JSON.parse(cleanContent);
      logLevel = config.log_level || "ERROR";
    }
  } catch (e) {}
}
loadConfig();
async function readTasksFromDb() {
  try {
    const fs = await import("fs");
    btpLog("DEBUG", "DB_FILE path:", DB_FILE);
    btpLog("DEBUG", "DB_FILE exists:", fs.existsSync(DB_FILE));
    if (!fs.existsSync(DB_FILE)) {
      btpLog("DEBUG", "DB file not found, returning cached tasks:", cachedTasks.length);
      return cachedTasks.length > 0 ? cachedTasks : [];
    }
    const stat = fs.statSync(DB_FILE);
    btpLog("DEBUG", "DB file size:", stat.size, "bytes");
    const db = new BunSqlite(DB_FILE);
    const tasks = [];
    const rows = db.query("SELECT * FROM tasks ORDER BY updatedAt DESC").all();
    btpLog("DEBUG", "Query returned", rows.length, "rows");
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
    db.close();
    btpLog("DEBUG", "TUI: Read", tasks.length, "tasks from DB");
    cachedTasks = tasks;
    btpLog("DEBUG", "TUI: Cache updated with", tasks.length, "tasks");
    return tasks;
  } catch (e) {
    btpLog("ERROR", "TUI read error:", e);
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
    btpLog("DEBUG", "TUI panel mounting, starting poll...");
    readTasksFromDb().then((tasks) => {
      setSnapshot(tasks);
      btpLog("DEBUG", "Initial tasks loaded:", tasks.length);
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
    btpLog("DEBUG", "TUI panel unmounting, stopped polling");
  });
  const handleTaskClick = (task) => {
    btpLog("DEBUG", "Navigating to task session:", task.sessionId);
    props.api.route.navigate("session", { sessionID: task.sessionId });
  };
  const toggleFilter = () => {
    setFilterMode((prev) => prev === "all" ? "session" : "all");
    btpLog("DEBUG", "Filter mode:", filterMode());
  };
  const filteredTasks = createMemo(() => {
    const mode = filterMode();
    const currentSession = props.sessionID();
    const tasks = snapshot();
    btpLog("DEBUG", "Filter mode:", mode, "currentSession:", currentSession, "total tasks:", tasks.length);
    if (mode === "session") {
      const filtered = tasks.filter((t) => t.parentSessionId === currentSession || t.sessionId === currentSession);
      btpLog("DEBUG", "Session filtered:", filtered.length, "tasks");
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
export {
  tui_default as default
};
