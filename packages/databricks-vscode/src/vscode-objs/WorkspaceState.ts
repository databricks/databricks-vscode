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
            value
        );
    }

    get skipDbConnectInstall() {
        return this.context.workspaceState.get(
            "databricks.debugging.skipDbConnectInstall",
            false
        );
    }

    set skipDbConnectInstall(value: boolean) {
        this.context.workspaceState.update(
            "databricks.debugging.skipDbConnectInstall",
            value
        );
    }

    get skippedEnvsForDbConnect() {
        return this.context.workspaceState.get<string[]>(
            "databricks.debugging.skipDbConnectInstallForEnvs",
            []
        );
    }

    skipDbConnectInstallForEnv(value: string) {
        const currentEnvs = this.skippedEnvsForDbConnect;
        if (!currentEnvs.includes(value)) {
            currentEnvs.push(value);
        }
        this.context.workspaceState.update(
            "databricks.debugging.skipDbConnectInstallForEnvs",
            currentEnvs
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
