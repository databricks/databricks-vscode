import { extensionDependency } from "../platform/extensions";

/*
 * Every other VS Code extension this one relies on. The manifest's
 * `extensionPack` installs the `inPack` ones with this extension, but VS Code
 * doesn't start them with it, and the user can disable or uninstall them; the
 * others are installed when a feature needs them. Use them all through
 * `kernel.extensionDependencies`. `test/contract/manifest.test.ts` checks that
 * `extensionPack` lists exactly the `inPack` ones.
 */

export const PYTHON = extensionDependency("ms-python.python", "Python", {
    // Started on demand, ms-python returns its API before it has loaded, and an interpreter selected then doesn't hold.
    ready: (api) => (api as { ready?: PromiseLike<unknown> } | undefined)?.ready,
});
export const DEBUGPY = extensionDependency("ms-python.debugpy", "Python Debugger");
export const JUPYTER = extensionDependency("ms-toolsai.jupyter", "Jupyter");
export const YAML = extensionDependency("redhat.vscode-yaml", "YAML");

/**
 * The SSH tunnel's remote window, in VS Code. The oldest the pinned CLI
 * (1.20.0) accepts ("version >= 0.120.0 is required"): it upgrades an older
 * one itself, through the shell command, which this avoids.
 */
export const REMOTE_SSH_VSCODE = extensionDependency(
    "ms-vscode-remote.remote-ssh",
    "Remote - SSH",
    { inPack: false, minVersion: "0.120.0" },
);
/** The same in Cursor, which has its own; its version isn't checked. */
export const REMOTE_SSH_CURSOR = extensionDependency("anysphere.remote-ssh", "Remote - SSH", {
    inPack: false,
});

/** In any order: `yarn fmt` sorts `extensionPack` by ID. */
export const EXTENSION_DEPENDENCIES = [
    PYTHON,
    DEBUGPY,
    JUPYTER,
    YAML,
    REMOTE_SSH_VSCODE,
    REMOTE_SSH_CURSOR,
];
