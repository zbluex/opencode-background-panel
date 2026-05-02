/** @jsxImportSource @opentui/solid */
// @ts-nocheck
import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createSidebarContentSlot } from "./slots/sidebar-content"

const id = "opencode-background-task-panel"

const tui: TuiPlugin = async (api: TuiPluginApi, _options, _meta) => {
    // Register sidebar slot - passes api for internal use
    const slot = createSidebarContentSlot(api)
    api.slots.register(slot)
}

export default {
    id,
    tui,
}
