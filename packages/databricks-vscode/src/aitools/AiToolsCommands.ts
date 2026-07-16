import {Disposable, QuickPickItem, window} from "vscode";
import {AiToolsManager} from "./AiToolsManager";
import {AiToolsScope} from "../cli/CliWrapper";
import {AiToolsInstallSource} from "../telemetry/constants";

interface ScopeQuickPickItem extends QuickPickItem {
    scope: AiToolsScope;
}

export class AiToolsCommands implements Disposable {
    private disposables: Disposable[] = [];

    constructor(private readonly aiToolsManager: AiToolsManager) {}

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }

    installCommand() {
        // The command may be invoked with a source argument (e.g. the first-load
        // modal passes "modal"); default to "sidePane" for the manual affordance.
        return async (source: AiToolsInstallSource = "sidePane") => {
            const scope = await this.pickScope();
            if (scope === undefined) {
                return;
            }
            await this.aiToolsManager.install(scope, source);
        };
    }

    /**
     * Show the scope picker. Project scope is always listed, but is shown
     * disabled (greyed, with a hint) and cannot be selected when no workspace
     * folder is open, since it installs into the open folder. Resolves to the
     * chosen scope, or undefined if the picker was dismissed.
     */
    private pickScope(): Promise<AiToolsScope | undefined> {
        const hasFolder = this.aiToolsManager.hasProjectFolder;
        const quickPick = window.createQuickPick<ScopeQuickPickItem>();
        quickPick.title = "Install Databricks AI tools";
        quickPick.placeholder = "Choose where to install the AI tools";
        quickPick.items = [
            {
                label: "$(globe) Global",
                detail: "Install AI tools for all projects on this machine",
                scope: "global",
            },
            {
                label: "$(folder) Project",
                detail: hasFolder
                    ? "Install AI tools into this project"
                    : "Open a folder to install AI tools into a project",
                // Render as disabled when there's no folder to install into.
                description: hasFolder ? undefined : "Requires an open folder",
                scope: "project",
            },
        ];

        return new Promise<AiToolsScope | undefined>((resolve) => {
            let resolved: AiToolsScope | undefined;
            this.disposables.push(
                quickPick.onDidAccept(() => {
                    const picked = quickPick.selectedItems[0];
                    // Ignore selection of the disabled project item; keep the
                    // picker open so the choice reads as non-actionable.
                    if (
                        picked === undefined ||
                        (picked.scope === "project" && !hasFolder)
                    ) {
                        return;
                    }
                    resolved = picked.scope;
                    quickPick.hide();
                }),
                quickPick.onDidHide(() => {
                    resolve(resolved);
                    quickPick.dispose();
                })
            );
            quickPick.show();
        });
    }

    checkForUpdatesCommand() {
        return async () => {
            await this.aiToolsManager.checkForUpdates();
        };
    }

    /**
     * Re-run install detection (and update check if installed). Used by the
     * error row to recover after a transient detection failure.
     */
    reloadCommand() {
        return async () => {
            await this.aiToolsManager.initialize();
        };
    }

    updateCommand() {
        return async () => {
            await this.aiToolsManager.update();
        };
    }

    uninstallCommand() {
        return async () => {
            const location = this.aiToolsManager.state.installLocation;
            if (location === undefined) {
                return;
            }
            const confirm = await window.showWarningMessage(
                `Uninstall Databricks AI tools (${location})?`,
                {modal: true},
                "Uninstall"
            );
            if (confirm !== "Uninstall") {
                return;
            }
            await this.aiToolsManager.uninstall();
        };
    }

    addCursorPluginCommand() {
        return async () => {
            await this.aiToolsManager.addCursorPlugin();
        };
    }
}
