import fs from "node:fs";
import path from "node:path";
import { fakeMemento } from "./fakes";
import { Uri } from "./vscode";

const packageDir = path.resolve(__dirname, "../..");

/**
 * The `ExtensionContext` that `activate()` reads, over the package's real
 * `package.json`, with its logs and storage under `dir`.
 */
export function fakeExtensionContext(dir: string) {
    const subscriptions: { dispose(): unknown }[] = [];
    return {
        subscriptions,
        extension: {
            id: "databricks.databricks",
            packageJSON: {
                ...JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8")),
                version: "2.20.0",
            },
        },
        extensionMode: 1,
        logUri: Uri.file(path.join(dir, "logs")),
        globalStorageUri: Uri.file(path.join(dir, "global")),
        globalState: fakeMemento(),
        workspaceState: fakeMemento(),
        asAbsolutePath: (p: string) => path.join(packageDir, p),
        environmentVariableCollection: {
            persistent: false,
            description: undefined as string | undefined,
            clear: () => {},
            replace: () => {},
            append: () => {},
            prepend: () => {},
        },
    };
}

/** Disposes what `activate()` pushed, newest first, as VS Code does. */
export function deactivateContext(context: { subscriptions: { dispose(): unknown }[] }): void {
    for (const s of context.subscriptions.toReversed()) {
        s.dispose();
    }
}
