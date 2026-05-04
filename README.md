# opencode-background-panel

[![npm](https://img.shields.io/npm/v/@zbluex/opencode-background-panel)](https://www.npmjs.com/package/@zbluex/opencode-background-panel)
[![MIT License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**OpenCode TUI 插件，在侧边栏实时显示后台任务执行状态，支持点击跳转查看。**

[npm](https://www.npmjs.com/package/@zbluex/opencode-background-panel) · [GitHub](https://github.com/zbluex/opencode-background-panel) · [功能介绍](#功能特点) · [安装](#安装) · [配置](#配置) · [开发](#开发)

---

## 功能特点

- **📋 实时任务列表** — 展示当前 session 中所有后台任务（运行中/已完成/失败）
- **🔍 快速跳转** — 点击任务直接跳转到对应 session 查看详情
- **🎯 按 session 过滤** — 默认显示当前 session 相关的任务，可切换为显示全部任务
- **📊 统计概览** — 显示 Total / Completed / Failed 任务计数
- **🖥️ 自适应终端** — 自动检测终端宽度，响应式布局
- **💾 SQLite 持久化** — 使用 WAL 模式存储，支持 Server/TUI 并发读写
- **⚙️ 灵活配置** — 支持跳过指定任务标题、自定义日志级别

## 安装

在 `opencode.jsonc` 中添加插件即可：

```jsonc
// opencode.jsonc
{
  "plugin": ["@zbluex/opencode-background-panel"]
}
```

OpenCode 会自动从 npm 下载并安装。

## 配置

插件首次加载时自动在 `~/.config/opencode/background-panel.jsonc` 创建默认配置：

```jsonc
{
  // 日志级别: DEBUG, INFO, ERROR (默认: ERROR)
  "log_level": "ERROR",

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
│   │   └── types.ts         # 共享类型定义
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

### TUI Plugin (`src/tui/index.tsx`)

- 在侧边栏 `sidebar_content` 插槽渲染任务面板
- 每秒轮询数据库获取最新任务状态
- 支持点击任务跳转到对应 session
- 版本号从 `package.json` 动态读取

### 任务生命周期

```
session.created (subagent)  →  任务创建 (running)
       ↓
session.idle               →  任务完成 (completed)
session.error              →  任务失败 (failed)
```

## 命令

| 操作 | 说明 |
|------|------|
| 点击任务 | 跳转到对应 session |
| 点击标题栏 `[Session]` / `[All]` | 切换过滤模式 |
| 滚动列表 | 查看更多任务 |

## 开发

**要求:** Bun ≥ 1.0

```bash
npm install              # 安装依赖
npm run build            # 构建插件（输出 dist/）
npm run typecheck        # 类型检查
npm run lint             # 代码检查（预留）
```

构建产物：

- `dist/index.js` — Server bundle（不含 JSX）
- `dist/tui/index.js` — TUI bundle

## License

MIT