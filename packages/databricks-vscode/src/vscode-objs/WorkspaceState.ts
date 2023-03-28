import {randomUUID} from "crypto";
import {ExtensionContext} from "vscode";

export class WorkspaceStateManager {
    constructor(private context: ExtensionContext) {}

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
