/* eslint-disable @typescript-eslint/naming-convention */
import {Config, Headers, RequestVisitor} from "@databricks/databricks-sdk";
import {AuthProvider} from "./AuthProvider";
import {
    commands,
    ConfigurationTarget,
    Extension,
    extensions,
    window,
    workspace,
    WorkspaceConfiguration,
} from "vscode";
import {AzureAccountExtensionApi, AzureSession} from "../../azure-accounts.api";
import {orchestrate, OrchestrationLoopError, Step} from "./orchestrate";
import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";
import {Loggers} from "../../logger";

const azureDatabricksLoginAppID = "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d";

interface Token {
    session: any;
    accessToken: string;
    refreshToken: string;
}

type AzureCloud = "AzureCloud" | "AzureChinaCloud" | "AzureUSGovernment";
type AzureStepName =
    | "activateExtension"
    | "tryLogin"
    | "setCloud"
    | "setTenantId";

export class AzureAuthProvider extends AuthProvider {
    private logger: NamedLogger;
    private azureAccount: AzureAccountExtensionApi | undefined;

    private _tenantId?: string;
    private _appId?: string;

    constructor(host: URL, tenantId?: string, appId?: string) {
        super(host, "azure-cli");

        this._tenantId = tenantId;
        this._appId = appId;

        this.logger = NamedLogger.getOrCreate(Loggers.Extension);
    }

    dispose() {}

    get tenantId(): string | undefined {
        return this._tenantId;
    }

    set appId(appId: string | undefined) {
        this._appId = appId;
    }

    get appId(): string | undefined {
        return this._appId;
    }

    describe(): string {
        return "Azure";
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
        const creds = await this.getCredentials(this.appId);

        return new Config({
            host: this.host.toString(),
            credentials: {
                name: "pat",
                async configure(): Promise<RequestVisitor> {
                    return async (headers: Headers) => {
                        headers[
                            "Authorization"
                        ] = `Bearer ${creds.accessToken}`;
                    };
                },
            },
            env: {},
        });
    }

    private getAzureCloud(url: URL): AzureCloud {
        if (url.hostname.endsWith("azure.cn")) {
            return "AzureChinaCloud";
        } else if (url.hostname.endsWith("azure.us")) {
            return "AzureUSGovernment";
        } else {
            return "AzureCloud";
        }
    }

    async check(silent: boolean): Promise<boolean> {
        let loginAttempts = 0;

        const steps: Record<AzureStepName, Step<boolean, AzureStepName>> = {
            activateExtension: async () => {
                if (await this.activateExtension()) {
                    return {
                        type: "next",
                        next: "setCloud",
                    };
                } else {
                    return {
                        type: "error",
                        error: new Error("Can't find Azure Account extension"),
                    };
                }
            },
            setCloud: async () => {
                await this.setCloud();
                return {
                    type: "next",
                    next: "tryLogin",
                };
            },
            tryLogin: async () => {
                loginAttempts += 1;
                const result = await this.tryLogin(this);
                if (result.iss) {
                    this._tenantId = result.iss;
                    return {
                        type: "next",
                        next: "setTenantId",
                    };
                } else if (result.aud) {
                    this._appId = result.aud;

                    return {
                        type: "next",
                        next: "tryLogin",
                    };
                } else if (result.canLogin) {
                    return {
                        type: "success",
                        result: true,
                    };
                } else {
                    if (loginAttempts >= 4) {
                        return {
                            type: "error",
                            error:
                                result.error ||
                                new Error("Can't login with Azure CLI"),
                        };
                    } else {
                        return {
                            type: "error",
                            error: new Error("Can't login with Azure"),
                        };
                    }
                }
            },
            setTenantId: async () => {
                await this.setTenantId();
                return {
                    type: "next",
                    next: "tryLogin",
                };
            },
        };

        let result: boolean;
        try {
            result = await orchestrate<boolean, keyof typeof steps>(
                steps,
                "activateExtension",
                20,
                this.logger
            );
        } catch (e: any) {
            let message: string;
            if (e instanceof OrchestrationLoopError) {
                message = "Can't login using Azure CLI";
            } else {
                message = e.message;
            }

            window.showErrorMessage(message);
            return false;
        }

        if (result && !silent) {
            window.showInformationMessage(
                "Databricks: Successfully logged in with Azure CLI"
            );
        }
        return result;
    }

    private async setTenantId(): Promise<void> {
        //await commands.executeCommand("azure-account.logout", true);

        const config: WorkspaceConfiguration =
            workspace.getConfiguration("azure");

        await config.update(
            "tenant",
            this.tenantId,
            ConfigurationTarget.Workspace
        );

        await commands.executeCommand("azure-account.login");
    }

    private async activateExtension(): Promise<boolean> {
        const azureAccountExtensionId = "ms-vscode.azure-account";
        const extension: Extension<AzureAccountExtensionApi> | undefined =
            extensions.getExtension<AzureAccountExtensionApi>(
                azureAccountExtensionId
            );
        if (!extension) {
            return false;
        }
        if (!extension.isActive) {
            await extension.activate();
        }

        this.azureAccount = extension.exports;
        return true;
    }

    private async setCloud(): Promise<boolean> {
        const cloud = this.getAzureCloud(this.host);

        const config: WorkspaceConfiguration =
            workspace.getConfiguration("azure");
        if (config.get("cloud") !== cloud) {
            await commands.executeCommand("azure-account.logout", true);
            //await commands.executeCommand("azure-account.selectCloud", cloud);
            await config.update("cloud", cloud, ConfigurationTarget.Workspace);
            await commands.executeCommand("azure-account.login");
            return false;
        }
        return true;
    }

    private async tryLogin(authProvider: AzureAuthProvider): Promise<{
        iss?: string;
        aud?: string;
        canLogin: boolean;
        error?: Error;
    }> {
        const workspaceClient = await authProvider.getWorkspaceClient();

        try {
            await workspaceClient.currentUser.me();
        } catch (e: any) {
            // parse error message
            let m = e.message.match(
                /Expected iss claim to be: https:\/\/sts\.windows\.net\/([a-z0-9-]+?)\/?, but was: https:\/\/sts\.windows\.net\/([a-z0-9-]+)\/?/
            );
            if (m) {
                return {
                    iss: m[1],
                    canLogin: false,
                };
            }

            m = e.message.match(
                /Expected aud claim to be: ([a-z0-9-]+?)\/?, but was: ([a-z0-9-]+)\/?/
            );
            if (m) {
                return {
                    aud: m[1],
                    canLogin: false,
                };
            }

            return {canLogin: false, error: e};
        }
        return {canLogin: true};
    }

    private async getCredentials(appId: string = azureDatabricksLoginAppID) {
        if (!this.azureAccount) {
            throw new Error("Azure Account extension is not activated");
        }

        if (!(await this.azureAccount.waitForLogin())) {
            await commands.executeCommand("azure-account.login");
        }

        const session = this.azureAccount.sessions[0];
        const token = await this.acquireToken(session, appId);

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
}
