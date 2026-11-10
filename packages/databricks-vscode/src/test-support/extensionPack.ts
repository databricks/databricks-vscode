import { EXTENSION_DEPENDENCIES, PYTHON } from "../kernel/extensionDependencies";
import { FakeMsPython } from "./fakeMsPython";
import { host } from "./vscode";

/**
 * Installs the extension pack's members into the `vscode` stand-in, inactive:
 * ms-python as `msPython` (which counts its own activations), the others as
 * stand-ins that record their activation in `activated`. Without this the
 * stand-in has none of them, as a window where they're missing or disabled.
 */
export function installExtensionPack(msPython = new FakeMsPython()): {
    msPython: FakeMsPython;
    activated: string[];
} {
    const activated: string[] = [];
    msPython.install();
    for (const { id } of EXTENSION_DEPENDENCIES.filter((d) => d.inPack && d !== PYTHON)) {
        const exports = { registerContributor: () => true };
        const extension = {
            isActive: false,
            exports,
            activate: async () => {
                activated.push(id);
                extension.isActive = true;
                return exports;
            },
        };
        host.extensions.set(id, extension);
    }
    return { msPython, activated };
}
