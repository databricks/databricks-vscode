import {randomUUID} from "crypto";
import {ExtensionContext} from "vscode";

export class WorkspaceStateManager {
    constructor(private context: ExtensionContext) {}

    get skipSwitchToWorkspace() {
        return this.context.workspaceState.get(
            "databricks.switch.to.workspace",
            false
        );
    }

    set skipSwitchToWorkspace(value: boolean) {
        this.context.workspaceState.update(
            "databricks.switch.to.workspace",
            true
        );
    }

    get skipAutocompleteConfigure() {
        return this.context.workspaceState.get(
            "databricks.autocompletion.skipConfigure",
            false
        );
    }

    set skipAutocompleteConfigure(value: boolean) {
        this.context.workspaceState.update(
            "databricks.autocompletion.skipConfigure",
            true
        );
    }

    get fixedUUID() {
        let uuid = this.context.workspaceState.get<string>(
            "databricks.fixedUUID"
        );
        if (!uuid) {
            uuid = randomUUID();
            this.context.workspaceState.update("databricks.fixedUUID", uuid);
        }
        return uuid;
    }
}
