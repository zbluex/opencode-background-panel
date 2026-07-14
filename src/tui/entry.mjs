// OpenTUI 0.4.x runtime registry bridge
// Probes for the virtual module registry (opentui:runtime-module:)
// Falls back to raw TSX source for older hosts

function isMissingRuntimeRegistry(error) {
    if (error == null) return false;
    // Bun throws ERR_MODULE_NOT_FOUND, Node throws MODULE_NOT_FOUND
    if (error.code === "ERR_MODULE_NOT_FOUND" || error.code === "MODULE_NOT_FOUND") return true;
    return error.code == null &&
        /can(?:not)?\s+(?:find|load|resolve|module|import)|missing/i.test(String(error));
}

const registryURL = "opentui:runtime-module:" + encodeURIComponent("@opentui/solid");

let mod;
try {
    await import(registryURL);
} catch (error) {
    if (!isMissingRuntimeRegistry(error)) throw error;
    console.log("[BTP] No OpenTUI runtime registry, falling back to raw TSX");
    mod = await import("./index.tsx");
}
if (!mod) {
    console.log("[BTP] Loading compiled TUI via runtime registry");
    try {
        mod = await import("../tui-compiled/index.tsx");
    } catch (error) {
        console.error("[BTP] Failed to load compiled TUI:", error);
        throw error;
    }
}
if (!mod || !mod.default) {
    console.error("[BTP] TUI module has no default export, got:", mod);
    throw new Error("[BTP] TUI module invalid");
}
export default mod.default;
