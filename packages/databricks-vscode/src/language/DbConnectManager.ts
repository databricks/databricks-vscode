import path from "path";
import {
    Disposable,
    window,
    StatusBarItem,
    StatusBarAlignment,
    ThemeColor,
    ExtensionContext,
} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {DotenvFileManager} from "../file-managers/DotenvFileManager";
import * as os from "os";
import * as fs from "fs/promises";
export class DbConnectManager implements Disposable {
    private disposables: Disposable[] = [];
    private dbConnectStatusBarItem: StatusBarItem;

    constructor(
        readonly connectionManager: ConnectionManager,
        readonly extensionContext: ExtensionContext,
        readonly dotEnvManager: DotenvFileManager
    ) {
        this.dbConnectStatusBarItem = window.createStatusBarItem(
            StatusBarAlignment.Left,
            100
        );
        this.dbConnectStatusBarItem.show();
        this.disposables.push(
            this.dbConnectStatusBarItem,
            this.connectionManager.onDidChangeCluster(this.refresh),
            this.connectionManager.onDidChangeState((state) => {
                if (state !== "CONNECTED") {
                    this.disableDbConnect();
                    return;
                }
                this.enableDbConnect();
            })
        );
        this.disableDbConnect();
    }

    refresh() {
        this.disableDbConnect();
        this.enableDbConnect();
    }

    async enableDbConnect() {
        const config =
            this.connectionManager.databricksWorkspace?.authProvider.getWorkspaceClient()
                .config;
        await config?.ensureResolved();
        const pat = config?.token;
        if (pat === undefined) {
            return;
        }

        const host = this.connectionManager.databricksWorkspace?.host.authority;
        if (host === undefined) {
            return;
        }

        const clusterId = this.connectionManager.cluster?.id;
        if (clusterId === undefined) {
            return;
        }

        const envString = `sc://${host}:443/;token=${pat};use_ssl=true;x-databricks-cluster-id=${clusterId}`;
        this.extensionContext.environmentVariableCollection.append(
            "SPARK_REMOTE",
            envString
        );
        this.extensionContext.environmentVariableCollection.append(
            "DATABRICKS_CONFIG_PROFILE",
            config?.profile ?? ""
        );
        this.dbConnectStatusBarItem.command = "databricks.dbconnect.disable";
        this.dbConnectStatusBarItem.text =
            "$(database) $(pass-filled) DbConnect Enabled";
        this.dbConnectStatusBarItem.backgroundColor = undefined;
        this.dbConnectStatusBarItem.show();
        await this.dotEnvManager.addVar("SPARK_REMOTE", envString);
        await this.dotEnvManager.addVar(
            "DATABRICKS_CONFIG_PROFILE",
            config?.profile ?? ""
        );

        let profileDir = path.join(
            os.homedir(),
            ".ipython",
            "profile_default",
            "startup"
        );
        if (process.env.IPYTHONDIR !== undefined) {
            profileDir = process.env.IPYTHONDIR;
        }
        await fs.copyFile(
            this.extensionContext.asAbsolutePath(
                path.join("resources", "python", "00-databricks-startup.py")
            ),
            path.join(profileDir, "00-databricks-startup.py")
        );
    }

    async disableDbConnect() {
        this.extensionContext.environmentVariableCollection.delete(
            "SPARK_REMOTE"
        );
        this.extensionContext.environmentVariableCollection.delete(
            "DATABRICKS_CONFIG_PROFILE"
        );
        this.dbConnectStatusBarItem.command = "databricks.dbconnect.enable";
        this.dbConnectStatusBarItem.text =
            "$(database) $(error) DbConnect Disabled";
        this.dbConnectStatusBarItem.backgroundColor = new ThemeColor(
            "inputValidation.errorBackground"
        );
        this.dbConnectStatusBarItem.show();
        await this.dotEnvManager.deleteVar("SPARK_REMOTE");
        await this.dotEnvManager.deleteVar("DATABRICKS_CONFIG_PROFILE");
    }

    dispose() {
        this.disableDbConnect();
        this.disposables.forEach((i) => i.dispose());
    }
}
