import * as vscode from "vscode";
import type { Disposable } from "vscode";
import type { ExtensionHost } from "./extensions";
import type { FileEvents } from "./fileEvents";
import type { FileSearch } from "./fileSearch";
import { MutableState, type State } from "./reactive";

/** `FileEvents` over VS Code's file system watcher. */
export const vscodeFileEvents: FileEvents = {
    watch(base, pattern, onEvent) {
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(vscode.Uri.file(base), pattern),
        );
        const report = (uri: vscode.Uri) => onEvent(uri.fsPath);
        const subscriptions = [
            watcher,
            watcher.onDidCreate(report),
            watcher.onDidChange(report),
            watcher.onDidDelete(report),
        ];
        return { dispose: () => subscriptions.forEach((s) => s.dispose()) };
    },
};

/**
 * `FileSearch` over `workspace.findFiles`, which VS Code runs outside the
 * extension host, so a large folder doesn't block it. The user's
 * `files.exclude` and `search.followSymlinks` still apply.
 */
export const vscodeFileSearch: FileSearch = {
    async find(base, pattern, exclude) {
        const files = await vscode.workspace.findFiles(
            new vscode.RelativePattern(vscode.Uri.file(base), pattern),
            exclude,
        );
        return files.map((uri) => uri.fsPath);
    },
};

/** `ExtensionHost` over `vscode.extensions` and the Extensions view. */
export const vscodeExtensions: ExtensionHost = {
    get: (id) => {
        const extension = vscode.extensions.getExtension(id);
        return (
            extension && {
                get isActive() {
                    return extension.isActive;
                },
                get exports(): unknown {
                    return extension.exports;
                },
                activate: () => extension.activate(),
                version: (extension.packageJSON as { version?: string } | undefined)?.version,
            }
        );
    },
    onDidChange: vscode.extensions.onDidChange,
    install: (id, title) =>
        vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, () =>
            // With `enable`, VS Code installs nothing for an extension that's already
            // there, only enables it; so a present one, being updated, goes without.
            vscode.extensions.getExtension(id) === undefined
                ? vscode.commands.executeCommand("workbench.extensions.installExtension", id, {
                      enable: true,
                  })
                : vscode.commands.executeCommand("workbench.extensions.installExtension", id),
        ),
    show: (id) => vscode.commands.executeCommand("workbench.extensions.search", `@id:${id}`),
};

/** The paths of the window's workspace folders, in order, kept current. */
export function workspaceFolders(): State<readonly string[]> & Disposable {
    const read = () => (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    const state = new MutableState<readonly string[]>(read());
    const subscription = vscode.workspace.onDidChangeWorkspaceFolders(() => state.set(read()));
    // Bound first: `Object.assign` replaces `state.dispose` with the function below.
    const disposeState = state.dispose.bind(state);
    return Object.assign(state, {
        dispose: () => {
            subscription.dispose();
            disposeState();
        },
    });
}
