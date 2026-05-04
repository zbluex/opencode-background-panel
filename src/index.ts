// Server-only entry point
// The TUI is loaded separately via the ./tui export in package.json
import type { Plugin } from "@opencode-ai/plugin"
import serverPlugin from "./server-plugin.ts"

export default {
  id: "opencode-background-panel",
  server: serverPlugin as unknown as Plugin,
}