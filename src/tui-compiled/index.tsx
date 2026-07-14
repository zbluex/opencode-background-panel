import { memo as _$memo } from "opentui:runtime-module:%40opentui%2Fsolid";
import { createTextNode as _$createTextNode } from "opentui:runtime-module:%40opentui%2Fsolid";
import { effect as _$effect } from "opentui:runtime-module:%40opentui%2Fsolid";
import { insertNode as _$insertNode } from "opentui:runtime-module:%40opentui%2Fsolid";
import { insert as _$insert } from "opentui:runtime-module:%40opentui%2Fsolid";
import { setProp as _$setProp } from "opentui:runtime-module:%40opentui%2Fsolid";
import { createElement as _$createElement } from "opentui:runtime-module:%40opentui%2Fsolid";
import { createComponent as _$createComponent } from "opentui:runtime-module:%40opentui%2Fsolid";
/** @jsxImportSource opentui:runtime-module:%40opentui%2Fsolid */
// @ts-nocheck
import { createSidebarContentSlot } from "./slots/sidebar-content"

const id = "opencode-background-panel"

const tui = async (api, _options, _meta) => {
    console.log("[BTP] TUI plugin loading...")
    console.log("[BTP] API keys:", Object.keys(api))
    console.log("[BTP] API slots:", typeof api.slots)
    console.log("[BTP] API version:", _meta?.version)

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
