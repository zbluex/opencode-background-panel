# opencode-background-panel

[![npm](https://img.shields.io/npm/v/opencode-background-panel)](https://www.npmjs.com/package/opencode-background-panel)
[![MIT License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

**OpenCode TUI 插件，在侧边栏实时显示当前 session 中后台执行的任务，点击即可跳转查看。**

[功能介绍](#功能特点) · [安装](#安装) · [配置](#配置) · [工作原理](#工作原理) · [开发](#开发)

---

## 功能特点

- **📋 实时任务列表** — 展示当前 session 中所有后台任务（运行中/已完成/失败）
- **🔍 快速跳转** — 点击任务直接跳转到对应 session 查看详情
- **🎯 按 session 过滤** — 默认只显示当前 session 相关的任务，可切换为显示全部
- **⚡ 状态自动刷新** — 每秒轮询更新任务状态，无需手动刷新
- **💾 SQLite 持久化** — 使用 WAL 模式存储，支持多进程并发访问

## 安装

### 自动安装（推荐）

```bash
# 克隆仓库后链接到插件目录
npm install
npm link
```

### 手动安装

1. 克隆本仓库到本地
2. 在 `~/.config/opencode/plugins/` 目录下创建符号链接：

```bash
git clone https://github.com/zbluex/opencode-background-panel.git
cd opencode-background-panel
npm install
# 创建符号链接 (Windows PowerShell)
New-Item -ItemType SymbolicLink -Target "C:\path\to\opencode-background-panel" -Path "$env:USERPROFILE\.config\opencode\plugins\opencode-background-panel"
```

### 配置 OpenCode

在 `opencode.jsonc` 中添加插件：

```jsonc
{
  "plugin": ["opencode-background-panel"]
}
```

## 配置

插件会在 `~/.config/opencode/background-panel.jsonc` 自动创建默认配置文件：

```jsonc
{
  // 跳过任务标题匹配这些正则模式的任务
  "skip_tasks": [
    // "magic-context-compartment",  // 跳过 magic-context 分隔
    // "^test",                      // 跳过以 test 开头
    // ".*ignore.*"                  // 跳过包含 ignore
  ]
}
```

## 工作原理

### 架构

插件由两部分组成：

**1. Server Plugin (`server-plugin.ts`)**
- 监听 OpenCode 事件：`session.created`、`session.idle`、`session.error`
- 捕获 subagent session 的创建和状态变化
- 将任务持久化到 SQLite 数据库

**2. TUI Plugin (`tui/index.tsx`)**
- 在侧边栏 `sidebar_content` 插槽渲染任务面板
- 每秒轮询数据库获取最新任务状态
- 支持点击任务跳转到对应 session

### 任务生命周期

```
session.created (subagent)  →  任务创建 (running)
       ↓
session.idle / session.error  →  任务完成/失败 (completed/failed)
```

### 数据存储

```
~/.config/opencode/plugins/opencode-background-panel/data/tasks.db
```

使用 SQLite WAL 模式，支持 Server Plugin 写入和 TUI Plugin 读取并发进行。

## 命令

| 操作 | 说明 |
|------|------|
| 点击任务 | 跳转到对应 session |
| 点击标题栏 | 切换 [Session]/[All] 过滤模式 |

## 开发

**要求:** Bun ≥ 1.0

```bash
bun install              # 安装依赖
bun run build            # 构建插件
bun run typecheck        # 类型检查
bun run lint             # 代码检查
bun run lint:fix         # 自动修复
```

## License

MIT