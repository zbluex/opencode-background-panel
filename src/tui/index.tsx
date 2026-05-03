/** @jsxImportSource @opentui/solid */
// @ts-nocheck
import type { TuiPlugin, TuiPluginApi, TuiSlotPlugin } from "@opencode-ai/plugin/tui"
import { createSidebarContentSlot } from "./slots/sidebar-content"

const id = "opencode-background-task-panel"

const tui: TuiPlugin = async (api: TuiPluginApi, _options, _meta) => {
    console.log("[BTP] TUI plugin loading...")
    console.log("[BTP] API keys:", Object.keys(api))
    console.log("[BTP] API slots:", typeof api.slots)
    console.log("[BTP] API version:", (_meta as any)?.version)

    const slot = createSidebarContentSlot(api)
    console.log("[BTP] Slot created with id:", slot.id)
    console.log("[BTP] Slot slots:", Object.keys(slot.slots))

    api.slots.register(slot)
    console.log("[BTP] TUI plugin registered successfully")
}

export default {
    id,
    tui,
}