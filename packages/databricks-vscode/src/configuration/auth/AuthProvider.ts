/* eslint-disable @typescript-eslint/naming-convention */
import {
    Config,
    ProductVersion,
    WorkspaceClient,
} from "@databricks/databricks-sdk";
import { Disposable } from "vscode";
import { workspaceConfigs } from "../../vscode-objs/WorkspaceConfigs";
import { BricksCliCheck } from "./BricksCliCheck";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const extensionVersion = require("../../../package.json")
    .version as ProductVersion;

export type AuthType = "azure-cli" | "google-id" | "bricks-cli" | "profile";

export abstract class AuthProvider implements Disposable {
    constructor(
        private readonly _host: URL,
        private readonly _authType: AuthType
    ) { }

    dispose() { }

    get host(): URL {
        return this._host;
    }

    get authType(): AuthType {
        return this._authType;
    }

    /**
     * Used to display the auth method in the UI
     */
    abstract describe(): string;
    abstract toJSON(): Record<string, unknown>;

    async getWorkspaceClient(): Promise<WorkspaceClient> {
        const config = await this.getSdkConfig();

        return new WorkspaceClient(config, {
            product: "databricks-vscode",
            productVersion: extensionVersion,
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async check(silent: boolean): Promise<boolean> {
        return true;
    }

    protected abstract getSdkConfig(): Promise<Config>;
}

export class ProfileAuthProvider extends AuthProvider {
    constructor(host: URL, private readonly profile: string) {
        super(host, "profile");
    }

    describe(): string {
        return `Profile '${this.profile}'`;
    }

    toJSON(): Record<string, unknown> {
        return {
            host: this.host.toString(),
            authType: this.authType,
            profile: this.profile,
        };
    }

    async getSdkConfig(): Promise<Config> {
        return new Config({
            profile: this.profile,
            configFile:
                workspaceConfigs.databrickscfgLocation ??
                process.env.DATABRICKS_CONFIG_FILE,
            env: {},
        });
    }
}

export class BricksCliAuthProvider extends AuthProvider {
    constructor(host: URL, readonly bricksPath: string) {
        super(host, "bricks-cli");
    }

    describe(): string {
        return "OAuth U2M";
    }

    toJSON(): Record<string, unknown> {
        return {
            host: this.host.toString(),
            authType: this.authType,
            bricksPath: this.bricksPath,
        };
    }

    getSdkConfig(): Config {
        return new Config({
            host: this.host.toString(),
            authType: "bricks-cli",
            bricksCliPath: this.bricksPath,
        });
    }

    async check(silent: boolean): Promise<boolean> {
        const bricksCliCheck = new BricksCliCheck(this);
        return bricksCliCheck.check(silent);
    }
}

export class AzureCliAuthProvider extends AuthProvider {
    private _tenantId?: string;
    private _appId?: string;

    constructor(host: URL, tenantId?: string, appId?: string) {
        super(host, "azure-cli");

        this._tenantId = tenantId;
        this._appId = appId;
    }

    get tenantId(): string | undefined {
        return this._tenantId;
    }

    get appId(): string | undefined {
        return this._appId;
    }

    describe(): string {
        return "Azure CLI";
    }

    toJSON(): Record<string, unknown> {
        return {
            host: this.host.toString(),
            authType: this.authType,
            tenantId: this.tenantId,
            appId: this.appId,
        };
    }

    async getSdkConfig(): Promise<Config> {
        const creds = await this.getCredentials();

        return new Config({
            host: this.host.toString(),
            token: creds!.accessToken,
            env: {},
        });
    }

    private async getCredentials() {
        const azureAccountExtensionId = "ms-vscode.azure-account";
        const extension: Extension<AzureAccountExtensionApi> | undefined =
            extensions.getExtension<AzureAccountExtensionApi>(
                azureAccountExtensionId
            );
        if (!extension) {
            throw new Error(
                `Azure Account extension is not installed. Please install it from the marketplace.`
            );
        }
        if (!extension.isActive) {
            await extension.activate();
        }

        const azureAccount = extension.exports;

        if (!(await azureAccount.waitForLogin())) {
            await commands.executeCommand("azure-account.login");
        }

        const session = azureAccount.sessions[0];
        const token = await this.acquireToken(
            session,
            "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d"
        );

        return token;
    }

    async acquireToken(
        session: AzureSession,
        resource: string
    ): Promise<Token> {
        return new Promise<Token>((resolve, reject) => {
            const credentials: any = (<any>session).credentials;
            // patch for https://github.com/AzureAD/azure-activedirectory-library-for-nodejs/issues/128
            (session.credentials2.authContext as any)._authority.aadApiVersion =
                "";
            session.credentials2.authContext.acquireToken(
                resource,
                credentials!.username,
                credentials!.clientId,
                function (err: any, result: any) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({
                            session,
                            accessToken: result.accessToken,
                            refreshToken: result.refreshToken,
                        });
                    }
                }
            );
        });
    }

    async check(silent: boolean): Promise<boolean> {
        // const cliCheck = new AzureCliCheck(this);
        // const result = await cliCheck.check(silent);
        // this._tenantId = cliCheck.tenantId;
        try {
            await this.getCredentials();
        } catch (e) {
            return false;
        }

        return true;
    }
}
