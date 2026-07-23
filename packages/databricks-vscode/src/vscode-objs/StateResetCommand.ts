import {Disposable, QuickPickItem, commands, window} from "vscode";
import {StateStorage, StorageKey} from "./StateStorage";

interface StateQuickPickItem extends QuickPickItem {
    key: StorageKey;
}

/**
 * Developer-only command that lets you reset individual persisted state keys
 * (global or workspace) via a multi-select picker. Useful for re-triggering
 * one-time flows (e.g. the AI tools install prompt) without wiping the whole
 * profile. Registered only in development builds — see extension activation.
 */
export class StateResetCommand implements Disposable {
    private disposables: Disposable[] = [];

    constructor(private readonly stateStorage: StateStorage) {}

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }

    resetCommand() {
        return async () => {
            const items: StateQuickPickItem[] = this.stateStorage.storageKeys
                .map(({key, location}) => ({
                    key,
                    label: key,
                    description: location,
                }))
                // Stable, readable ordering.
                .sort((a, b) => a.label.localeCompare(b.label));

            const picked = await window.showQuickPick(items, {
                title: "Reset Databricks state",
                placeHolder: "Select the state keys to reset",
                canPickMany: true,
            });
            if (picked === undefined || picked.length === 0) {
                return;
            }

            for (const item of picked) {
                await this.stateStorage.reset(item.key);
            }

            const reload = "Reload Window";
            const choice = await window.showInformationMessage(
                `Reset ${picked.length} state key(s). Reload the window for the change to fully take effect?`,
                reload
            );
            if (choice === reload) {
                await commands.executeCommand("workbench.action.reloadWindow");
            }
        };
    }
}
