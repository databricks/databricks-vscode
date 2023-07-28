import {
    ExecUtils,
    ProductVersion,
    WorkspaceClient,
} from "@databricks/databricks-sdk";
import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";
import {commands, Disposable, Uri, window} from "vscode";
import {Loggers} from "../../logger";
import {AzureCliAuthProvider} from "./AuthProvider";
import {orchestrate, OrchestrationLoopError, Step} from "./orchestrate";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const extensionVersion = require("../../../package.json")
    .version as ProductVersion;

type AzureCloud = "AzureCloud" | "AzureChinaCloud" | "AzureUSGovernment";

type AzureStepName =
    | "tryLogin"
    | "findCli"
    | "installCli"
    | "isLoggedIn"
    | "loginAzureCli";

export class AzureCliCheck implements Disposable {
    private disposables: Disposable[] = [];
    private isCodeSpaces: boolean;
    private logger: NamedLogger;

    tenantId: string | undefined;
    azureLoginAppId: string | undefined;

    constructor(
        private authProvider: AzureCliAuthProvider,
        private azBinPath: string = "az"
    ) {
        this.isCodeSpaces = process.env.CODESPACES === "true";
        this.logger = NamedLogger.getOrCreate(Loggers.Extension);
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
        this.disposables = [];
    }

    public async check(silent = false): Promise<boolean> {
        this.tenantId = this.authProvider.tenantId;

        let loginAttempts = 0;

        const steps: Record<AzureStepName, Step<boolean, AzureStepName>> = {
            tryLogin: async () => {
                loginAttempts += 1;
                const result = await this.tryLogin(this.authProvider.host);
                if (result.iss) {
                    this.tenantId = result.iss;
                    return {
                        type: "next",
                        next: "loginAzureCli",
                    };
                } else if (result.expired) {
                    return {
                        type: "next",
                        next: "loginAzureCli",
                    };
                } else if (result.aud) {
                    this.azureLoginAppId = result.aud;
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
                            type: "next",
                            next: "findCli",
                        };
                    }
                }
            },
            findCli: async () => {
                if (await this.hasAzureCli()) {
                    return {
                        type: "next",
                        next: "isLoggedIn",
                    };
                } else {
                    return {
                        type: "next",
                        next: "installCli",
                    };
                }
            },
            installCli: async () => {
                await this.showAzureCliInstallationInstructions();
                return {
                    type: "success",
                    result: false,
                };
            },
            isLoggedIn: async () => {
                if (await this.isAzureCliLoggedIn()) {
                    return {
                        type: "next",
                        next: "tryLogin",
                    };
                }
                return {
                    type: "next",
                    next: "loginAzureCli",
                };
            },
            loginAzureCli: async () => {
                if (await this.loginAzureCli(this.tenantId)) {
                    return {
                        type: "next",
                        next: "tryLogin",
                    };
                } else {
                    return {
                        type: "success",
                        result: false,
                    };
                }
            },
        };

        let result: boolean;
        try {
            result = await orchestrate<boolean, keyof typeof steps>(
                steps,
                "findCli",
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

    private async tryLogin(host: URL): Promise<{
        iss?: string;
        aud?: string;
        canLogin: boolean;
        expired: boolean;
        error?: Error;
    }> {
        const workspaceClient = new WorkspaceClient(
            {
                host: host.toString(),
                authType: "azure-cli",
                azureLoginAppId: this.azureLoginAppId,
            },
            {
                product: "databricks-vscode",
                productVersion: extensionVersion,
            }
        );
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
                    expired: false,
                };
            }

            m = e.message.match(
                /(Interactive authentication is needed). Please run:\naz login( --scope ([a-z0-9-]+?)\/\.default)?\n/s
            );
            if (m) {
                return {
                    canLogin: false,
                    error: new Error(m[1]),
                    expired: true,
                };
            }

            m = e.message.match(
                /Expected aud claim to be: ([a-z0-9-]+?)\/?, but was: ([a-z0-9-]+)\/?/
            );
            if (m) {
                return {
                    aud: m[1],
                    canLogin: false,
                    expired: false,
                };
            }

            return {canLogin: false, error: e, expired: false};
        }
        return {canLogin: true, expired: false};
    }

    // check if Azure CLI is installed
    public async hasAzureCli(): Promise<boolean> {
        try {
            const {stdout} = await ExecUtils.execFileWithShell(this.azBinPath, [
                "--version",
            ]);
            if (stdout.indexOf("azure-cli") !== -1) {
                return true;
            }
        } catch (e) {
            return false;
        }
        return false;
    }

    // show installation instructions
    public async showAzureCliInstallationInstructions(): Promise<void> {
        const choice = await window.showInformationMessage(
            "Azure CLI is not installed. Please install it to continue.",
            "Show installation instructions",
            "Cancel"
        );

        if (choice === "Show installation instructions") {
            commands.executeCommand(
                "vscode.open",
                Uri.parse(
                    "https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
                )
            );
        }
    }

    // check if Azure CLI is logged in
    public async isAzureCliLoggedIn(): Promise<boolean> {
        try {
            await ExecUtils.execFileWithShell(this.azBinPath, [
                "cloud",
                "set",
                "--name",
                this.getAzureCloud(this.authProvider.host),
            ]);

            const {stdout, stderr} = await ExecUtils.execFileWithShell(
                this.azBinPath,
                ["account", "list"]
            );
            if (stdout === "[]") {
                return false;
            }
            if (stderr.indexOf("az login") !== -1) {
                return false;
            }
        } catch (e) {
            return false;
        }
        return true;
    }

    getAzureCloud(url: URL): AzureCloud {
        if (url.hostname.endsWith("azure.cn")) {
            return "AzureChinaCloud";
        } else if (url.hostname.endsWith("azure.us")) {
            return "AzureUSGovernment";
        } else {
            return "AzureCloud";
        }
    }

    // login using azure CLI
    public async loginAzureCli(tenant = ""): Promise<boolean> {
        let message = 'You need to run "az login" to login with Azure.';
        if (tenant) {
            message = `You need to tun "az login --allow-no-subscriptions -t ${tenant}" to login with Azure.`;
        }
        const choice = await window.showInformationMessage(
            message,
            "Run command",
            "Cancel"
        );

        if (choice === "Run command") {
            const terminal = window.createTerminal("az login");
            this.disposables.push(terminal);
            terminal.show();

            const useDeviceCode = this.isCodeSpaces ? "--use-device-code" : "";

            terminal.sendText(
                `${
                    this.azBinPath
                } login --allow-no-subscriptions ${useDeviceCode} ${
                    tenant ? "-t " + tenant : ""
                }; echo "Press any key to close the terminal and continue ..."; read; exit`
            );

            return await Promise.race<boolean>([
                new Promise<boolean>((resolve) => {
                    setTimeout(() => {
                        resolve(false);
                        this.dispose();
                    }, 1000 * 60);
                }),
                new Promise<boolean>((resolve) => {
                    this.disposables.push(
                        window.onDidCloseTerminal((t) => {
                            if (t === terminal) {
                                resolve(true);
                                this.dispose();
                            }
                        })
                    );
                }),
            ]);
        } else {
            return false;
        }
    }
}
