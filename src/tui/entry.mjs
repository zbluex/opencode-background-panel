// OpenTUI 0.4.x runtime registry bridge
// Probes for the virtual module registry (opentui:runtime-module:)
// Falls back to raw TSX source for older hosts

function isMissingRuntimeRegistry(error) {
    return error != null &&
        error.code == null &&
        /can(?:not)?\s+(?:find|load|resolve|module|import)|missing/i.test(String(error));
}

const registryURL = "opentui:runtime-module:" + encodeURIComponent("@opentui/solid");

let mod;
try {
    await import(registryURL);
} catch (error) {
    if (!isMissingRuntimeRegistry(error)) throw error;
    mod = await import("./index.tsx");
}
if (!mod) {
    mod = await import("../tui-compiled/index.tsx");
}
export default mod.default;
