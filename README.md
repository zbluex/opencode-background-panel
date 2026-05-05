# opencode-background-panel

[![npm](https://img.shields.io/npm/v/opencode-background-panel)](https://www.npmjs.com/package/opencode-background-panel)
[![MIT License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**OpenCode TUI 插件，在侧边栏实时显示后台任务执行状态，点击即可跳转查看。**

[npm](https://www.npmjs.com/package/opencode-background-panel) · [GitHub](https://github.com/zbluex/opencode-background-panel) · [功能介绍](#功能特点) · [安装](#安装) · [配置](#配置) · [开发](#开发)

---

## 功能特点

- **📋 实时任务列表** — 展示当前 session 中所有后台任务（运行中/已完成/失败）
- **🔍 快速跳转** — 点击任务直接跳转到对应 session 查看详情
- **🎯 一键过滤** — 点击标题栏 `[Session]` / `[All]` 切换当前 session 或全局任务视图
- **📊 统计概览** — Tasks 标题下一行展示 Total / Running / Completed / Failed 统计，均匀分布
- **🔄 自动注册** — 插件启动时自动写入 `~/.config/opencode/tui.json`，无需手动配置
- **🖥️ 自适应终端** — 自动检测终端宽度，响应式布局
- **💾 SQLite 持久化** — 使用 WAL 模式存储，支持 Server/TUI 并发读写
- **⚙️ 灵活配置** — 支持跳过指定任务标题、自定义日志级别

## 安装

在 `opencode.jsonc` 中添加插件即可：

```jsonc
// opencode.jsonc
{
  "plugin": ["opencode-background-panel"]
}
```

OpenCode 会自动从 npm 下载并安装。

> 💡 插件启动后会自动在 `~/.config/opencode/tui.json` 中注册 TUI 侧边栏入口，首次安装后重启即可看到效果。

## 配置

插件首次加载时自动在 `~/.config/opencode/background-panel.jsonc` 创建默认配置：

```jsonc
{
  // 日志级别: DEBUG, INFO, ERROR, NONE (默认: NONE，不输出任何日志)
  "log_level": "NONE",

  // 跳过任务标题匹配这些正则模式的任务
  // 示例:
  //   "magic-context-compartment" - 跳过 magic-context 分隔舱
  //   "^test"                    - 跳过以 test 开头
  //   ".*ignore.*"               - 跳过包含 ignore
  "skip_tasks": [],

  // 数据目录（自动管理，请勿手动编辑）
  "data_dir": "...",
  "db_file": "..."
}
```

## 架构

插件采用 Server + TUI 分离架构：

```
opencode-background-panel/
├── src/
│   ├── index.ts              # 插件入口，导出 server/tui
│   ├── server-plugin.ts     # Server Plugin — 监听事件，持久化任务到 SQLite
│   ├── repo/
│   │   └── Database.ts      # SQLite 数据库封装（WAL 模式）
│   ├── shared/
│   │   ├── types.ts         # 共享类型定义
│   │   └── tui-config.ts    # tui.json 自动注册（server 启动时写入插件入口）
│   └── tui/
│       ├── index.tsx        # TUI Plugin — 注册侧边栏插槽
│       └── slots/
│           └── sidebar-content.tsx  # 侧边栏 UI 渲染
├── dist/
│   ├── index.js              # Server bundle（无 JSX）
│   └── tui/
│       └── index.js         # TUI bundle
└── package.json
```

### Server Plugin (`dist/index.js`)

- 使用 Hooks 模式接收 OpenCode 事件
- 监听 `session.created`、`session.idle`、`session.status`、`session.error`
- 捕获 subagent session 的创建和状态变化
- 将任务持久化到 SQLite（路径通过 `background-panel.jsonc` 共享给 TUI）
- **自动注册** — 启动时调用 `ensureTuiPluginEntry()` 写入 `~/.config/opencode/tui.json`

### Shared (`src/shared/tui-config.ts`)

- 解析 `~/.config/opencode/tui.json(c)`，将 `opencode-background-panel` 添加到 `plugin` 数组
- 支持 JSONC 注释（使用 `comment-json` 库），写入时保留原有注释格式
- 智能去重：检测已有入口则跳过，不会重复添加

### TUI Plugin (`src/tui/index.tsx`)

- 在侧边栏 `sidebar_content` 插槽渲染任务面板
- 每秒轮询数据库获取最新任务状态
- 支持点击任务跳转到对应 session
- 标题栏点击切换 `[Session]` / `[All]` 过滤模式
- **统计行** — Tasks 标题下方均匀分布 Total / Running / Completed / Failed 计数
- 版本号从 `package.json` 动态读取

### 任务生命周期

```
session.created (subagent)  →  任务创建 (running)
       ↓
session.idle               →  任务完成 (completed)
session.error              →  任务失败 (failed)
```

## 界面

```
┌─ Tasks [Session] ─────────── v{x.y.z} ───┐
│ 📊 T:12    ▶ R:3    ✓ C:8    ✗ F:2      │
│ Running: 3 active                       │
│  ▶ Sub-task analysis         30s ago     │
│  Completed                              │
│  ✓ Report generation         2m ago      │
│  Failed                                 │
│  ✗ Deploy to prod            5m ago      │
└──────────────────────────────────────────┘
```

## 命令

| 操作 | 说明 |
|------|------|
| 点击任务 | 跳转到对应 session |
| 点击 `[Session]` / `[All]` | 切换当前 session / 全局过滤 |
| 点击统计行 | — |
| 滚动列表 | 查看更多任务 |

## 开发

**要求:** Bun ≥ 1.0

```bash
bun install              # 安装依赖
bun run build            # 构建 Server bundle（dist/index.js）
bun run typecheck        # 类型检查
```

> TUI 插件代码在 `src/tui/`，通过 `exports` 字段从源码直接加载，无需单独构建。
> 修改 TUI 文件后重启 OpenCode 即可生效。

构建产物：

- `dist/index.js` — Server bundle（Bun 构建，不含 JSX）

## License

MIT