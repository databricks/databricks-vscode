import {randomUUID} from "crypto";
import {ExtensionContext} from "vscode";

export class StateStorage {
    constructor(private context: ExtensionContext) {}

    get fixedRandom() {
        let randomNum = this.context.globalState.get<number>(
            "databricks.fixedRandom"
        );
        if (!randomNum) {
            randomNum = Math.random();
            this.context.globalState.update(
                "databricks.fixedRandom",
                randomNum
            );
        }
        return randomNum;
    }

    get wsfsFeatureFlag() {
        return true;
    }

    get skipSwitchToWorkspace() {
        return this.context.workspaceState.get(
            "databricks.wsfs.skipSwitchToWorkspace",
            false
        );
    }

    set skipSwitchToWorkspace(value: boolean) {
        this.context.workspaceState.update(
            "databricks.wsfs.skipSwitchToWorkspace",
            value
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
            value
        );
    }

    get skippedEnvsForDbConnect() {
        return this.context.globalState.get<string[]>(
            "databricks.debugging.skipDbConnectInstallForEnvs",
            []
        );
    }

    skipDbConnectInstallForEnv(value: string) {
        const currentEnvs = this.skippedEnvsForDbConnect;
        if (!currentEnvs.includes(value)) {
            currentEnvs.push(value);
        }
        this.context.globalState.update(
            "databricks.debugging.skipDbConnectInstallForEnvs",
            currentEnvs
        );
    }

    get skippedEnvsForDatabricksSdk() {
        return this.context.globalState.get<string[]>(
            "databricks.debugging.skipDatabricksSdkInstallForEnvs",
            []
        );
    }

    skipDatabricksSdkInstallForEnv(value: string) {
        const currentEnvs = this.skippedEnvsForDatabricksSdk;
        if (!currentEnvs.includes(value)) {
            currentEnvs.push(value);
        }
        this.context.globalState.update(
            "databricks.debugging.skipDatabricksSdkInstallForEnvs",
            currentEnvs
        );
    }

    get lastInstalledExtensionVersion() {
        return this.context.workspaceState.get<string>(
            "databricks.lastInstalledExtensionVersion",
            "0.0.0"
        );
    }

    set lastInstalledExtensionVersion(value: string) {
        this.context.workspaceState.update(
            "databricks.lastInstalledExtensionVersion",
            value
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
