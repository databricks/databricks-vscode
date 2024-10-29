import {
    Context,
    ProductVersion,
    WorkspaceClient,
    logging,
} from "@databricks/databricks-sdk";
import {CancellationToken, commands, Disposable, Uri, window} from "vscode";
import {Loggers} from "../../logger";
import {AzureCliAuthProvider} from "./AuthProvider";
import {orchestrate, OrchestrationLoopError, Step} from "./orchestrate";
import {ShellUtils} from "../../utils";
import {execFile} from "../../cli/CliWrapper";
import {
    FileNotFoundException,
    isFileNotFound,
} from "@databricks/databricks-sdk/dist/config/execUtils";

// eslint-disable-next-line @typescript-eslint/naming-convention
const {NamedLogger} = logging;

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

async function execFileWithShell(
    cmd: string,
    args: Array<string>,
    cancellationToken?: CancellationToken
): Promise<{
    stdout: string;
    stderr: string;
}> {
    try {
        return await execFile(cmd, args, {shell: true}, cancellationToken);
    } catch (e) {
        if (isFileNotFound(e)) {
            throw new FileNotFoundException(e.message);
        } else {
            throw e;
        }
    }
}

export class AzureCliCheck implements Disposable {
    private disposables: Disposable[] = [];
    private isCodeSpaces: boolean;
    private logger: logging.NamedLogger;

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

    public async check(
        cancellationToken?: CancellationToken
    ): Promise<boolean> {
        this.tenantId = this.authProvider.tenantId;

        let loginAttempts = 0;

        const steps: Record<AzureStepName, Step<boolean, AzureStepName>> = {
            tryLogin: async () => {
                loginAttempts += 1;
                const result = await this.tryLogin(
                    this.authProvider.host,
                    cancellationToken
                );
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
                if (await this.hasAzureCli(cancellationToken)) {
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
                if (await this.isAzureCliLoggedIn(cancellationToken)) {
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
                if (
                    await this.loginAzureCli(this.tenantId, cancellationToken)
                ) {
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
                this.logger,
                cancellationToken
            );
        } catch (e: any) {
            let message: string;
            if (e instanceof OrchestrationLoopError) {
                message = "Can't login using Azure CLI";
            } else {
                message = e.message;
            }

            NamedLogger.getOrCreate(Loggers.Extension).error(message, e);
            window.showErrorMessage(message);
            return false;
        }

        return result;
    }

    private async tryLogin(
        host: URL,
        cancellationToken?: CancellationToken
    ): Promise<{
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
            await workspaceClient.currentUser.me(
                new Context({cancellationToken})
            );
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
    public async hasAzureCli(
        cancellationToken?: CancellationToken
    ): Promise<boolean> {
        try {
            const {stdout} = await execFileWithShell(
                this.azBinPath,
                ["--version"],
                cancellationToken
            );
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
    public async isAzureCliLoggedIn(
        cancellationToken?: CancellationToken
    ): Promise<boolean> {
        try {
            await execFileWithShell(
                this.azBinPath,
                [
                    "cloud",
                    "set",
                    "--name",
                    this.getAzureCloud(this.authProvider.host),
                ],
                cancellationToken
            );

            const {stdout, stderr} = await execFileWithShell(
                this.azBinPath,
                ["account", "list"],
                cancellationToken
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
    public async loginAzureCli(
        tenant = "",
        cancellationToken?: CancellationToken
    ): Promise<boolean> {
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
                }; echo "Press any key to close the terminal and continue ..."; ${ShellUtils.readCmd()}; exit`
            );

            cancellationToken?.onCancellationRequested(() =>
                terminal.dispose()
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
                                resolve(
                                    cancellationToken?.isCancellationRequested !==
                                        true
                                );
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
