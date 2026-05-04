// Combined plugin entry point - exposes both server and tui plugins
// This is loaded by OpenCode when oc-plugin: ["server", "tui"] is specified

import type { TuiPlugin, TuiPluginApi, TuiSlotPlugin } from "@opencode-ai/plugin/tui"
import type { Plugin, PluginInput } from "@opencode-ai/plugin"

// Re-export server plugin
import serverPlugin from "./server-plugin.ts"

// Re-export TUI plugin (needs @ts-nocheck due to @opentui/solid JSX)
import tuiPlugin from "./tui/index.tsx"

const id = "opencode-background-panel"

const tui: TuiPlugin = tuiPlugin as unknown as TuiPlugin

export default {
  id,
  server: serverPlugin as unknown as Plugin,
  tui,
}