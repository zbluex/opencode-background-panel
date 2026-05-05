/**
 * Auto-configure tui.json with opencode-background-panel TUI plugin entry.
 * Called from the server plugin at startup so the TUI sidebar loads on next restart.
 * Mirrors the pattern used by @cortexkit/opencode-magic-context.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { homedir } from "node:os"
import { parse, stringify } from "comment-json"

const PLUGIN_ENTRY = "opencode-background-panel"

function isBackgroundPanelEntry(entry: string): boolean {
  if (!entry) return false
  if (entry === PLUGIN_ENTRY) return true
  if (entry.startsWith(`${PLUGIN_ENTRY}@`)) return true
  if (entry.includes("opencode-background-panel")) return true
  return false
}

function resolveTuiConfigPath(): string {
  const configDir = join(homedir(), ".config", "opencode")
  const jsoncPath = join(configDir, "tui.jsonc")
  const jsonPath = join(configDir, "tui.json")

  if (existsSync(jsoncPath)) return jsoncPath
  if (existsSync(jsonPath)) return jsonPath
  return jsonPath // default: create tui.json
}

/**
 * Ensure tui.json has the opencode-background-panel TUI plugin entry.
 * Creates tui.json if it doesn't exist. Silently skips if already present.
 */
export function ensureTuiPluginEntry(): boolean {
  try {
    const configPath = resolveTuiConfigPath()

    let config: Record<string, unknown> = {}
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, "utf-8")
      config = (parse(raw) as Record<string, unknown>) ?? {}
    }

    const plugins = Array.isArray(config.plugin)
      ? config.plugin.filter((p): p is string => typeof p === "string")
      : []

    const existingIdx = plugins.findIndex(isBackgroundPanelEntry)
    if (existingIdx >= 0) {
      const existing = plugins[existingIdx]
      if (existing === PLUGIN_ENTRY) {
        return false // Already present
      }
      // Upgrade bare npm name to @latest format if it's just the name
      if (existing === PLUGIN_ENTRY) {
        plugins[existingIdx] = PLUGIN_ENTRY
      } else {
        return false
      }
    } else {
      plugins.push(PLUGIN_ENTRY)
    }
    config.plugin = plugins

    mkdirSync(dirname(configPath), { recursive: true })
    writeFileSync(configPath, `${stringify(config, null, 2)}\n`)
    console.log(`[BTP] updated TUI plugin entry in ${configPath}`)
    return true
  } catch (error) {
    console.log(
      `[BTP] failed to update tui.json: ${error instanceof Error ? error.message : String(error)}`,
    )
    return false
  }
}
