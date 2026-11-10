// The import boundaries of src/, checked on resolved paths:
// `../../kernel/x` from a feature and `../kernel/x` from platform are the
// same layer. src/test/contract/boundaries.test.ts runs these rules;
// `yarn workspace databricks lint:deps` prints the violations with
// each rule's comment. Paths are relative to packages/databricks-vscode.

/** Test files. The layering of features/ and the bootstrap don't bind them. */
const TEST = "(\\.test\\.ts$|^src/(test|test-support)/)";

/**
 * The vscode adapters: the only platform/ modules that load vscode at
 * runtime. The pattern also matches their tests.
 */
const ADAPTERS =
    "^src/platform/(workspace|ui/quickPick|ui/treeCommands|ui/WebviewHost)(\\.test)?\\.ts$";

/**
 * `vscode` resolves to @types/vscode/index.d.ts; the bare name covers a run
 * without node_modules.
 */
const VSCODE = "(^vscode$|/@types/vscode/)";

/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
    forbidden: [
        {
            name: "platform-is-bottom",
            severity: "error",
            comment:
                "platform/ is the bottom layer: it must not import kernel/ or features/. Move the shared code down into platform/, or take it as a parameter or callback.",
            from: { path: "^src/platform/" },
            to: { path: "^src/(kernel|features)/" },
        },
        {
            name: "kernel-below-features",
            severity: "error",
            comment:
                "kernel/ sits below features/ and must not import it. Move the shared code into kernel/, or declare an internalCommand() in kernel/ that the feature registers.",
            // Temporary exemption: this test imports features/python/setup/uv/.
            // Remove it once that import is gone.
            from: {
                path: "^src/kernel/",
                pathNot: "^src/kernel/cli/commands/environments\\.test\\.ts$",
            },
            to: { path: "^src/features/" },
        },
        {
            name: "features-apart",
            severity: "error",
            comment:
                "Features never import each other. Run the other feature's typed internal command instead (internalCommand() in kernel/, ctx.commands.registerInternal and ctx.commands.execute), or move the shared code into kernel/ or platform/.",
            from: { path: "^src/features/([^/]+)/", pathNot: TEST },
            to: { path: "^src/features/", pathNot: "^src/features/$1/" },
        },
        {
            name: "kernel-without-vscode",
            severity: "error",
            comment:
                "kernel/ doesn't depend on VS Code, so it runs and is tested under plain Node. Take the type from platform/ (Disposable and Event are in platform/event.ts), or receive the value from extension.ts as a parameter.",
            from: { path: "^src/kernel/" },
            to: { path: VSCODE },
        },
        {
            name: "vscode-only-in-adapters",
            severity: "error",
            comment:
                "Only the four platform adapters (workspace.ts, ui/quickPick.ts, ui/treeCommands.ts, ui/WebviewHost.ts) may load vscode at runtime. Use `import type`, or move the vscode call into an adapter.",
            from: { path: "^src/platform/", pathNot: ADAPTERS },
            to: { path: VSCODE, dependencyTypesNot: ["type-only"] },
        },
        {
            name: "adapters-only-from-above",
            severity: "error",
            comment:
                "The vscode adapters load vscode at runtime, so kernel/ and the rest of platform/ must not import them. Depend on a vscode-free type instead (such as FileEvents in platform/fileEvents.ts) and let extension.ts pass the adapter in.",
            from: { path: "^src/(kernel|platform)/", pathNot: ADAPTERS },
            to: { path: ADAPTERS },
        },
        {
            name: "spawn-only-in-process",
            severity: "error",
            comment:
                "Start child processes through platform/process.ts: kernel.cli or kernel.processes, with kernel.childEnv(). It is injectable, so tests use fakes instead of real processes, and it kills process trees. Tests may spawn directly.",
            from: { path: "^src/", pathNot: [TEST, "^src/platform/process\\.ts$"] },
            to: { path: "^(node:)?child_process$" },
        },
        {
            name: "test-support-only-in-tests",
            severity: "error",
            comment: "Only tests may import test-support/.",
            from: { pathNot: TEST },
            to: { path: "^src/test-support/" },
        },
        {
            name: "bootstrap-only-from-root",
            severity: "error",
            comment: "Only the bootstrap may import extension.ts, features.ts and api.ts.",
            from: { path: "^src/(platform|kernel|features)/", pathNot: TEST },
            to: { path: "^src/[^/]+\\.ts$" },
        },
    ],
    options: {
        // The API types are a package of their own (packages/databricks-vscode-types),
        // outside these rules. Not following them also keeps swc from reading a file
        // outside the package, which fails on Windows.
        doNotFollow: { path: ["node_modules", "^\\.\\./databricks-vscode-types/"] },
        // dependency-cruiser's TypeScript parser needs typescript < 7. swc
        // keeps `import type` as a type-only dependency (boundaries.test.ts
        // checks it), so kernel/ can't take even a type from vscode.
        parser: "swc",
        enhancedResolveOptions: {
            exportsFields: ["exports"],
            conditionNames: ["types", "import", "require", "node", "default"],
        },
    },
};
