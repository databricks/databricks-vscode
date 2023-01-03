import {CurrentUserService, ExecUtils} from "@databricks/databricks-sdk";
import {commands, Disposable, Uri, window} from "vscode";
import {ConnectionManager} from "./ConnectionManager";
import {AuthProvider} from "./AuthProvider";

export type Step<S, N> = () => Promise<
    SuccessResult<S> | NextResult<N> | ErrorResult
>;

type StepResult<S, N> = SuccessResult<S> | NextResult<N> | ErrorResult;

export interface SuccessResult<T> {
    type: "success";
    result: T;
}

export interface NextResult<T> {
    type: "next";
    next: T;
}

export interface ErrorResult {
    type: "error";
    error: Error;
}

async function orchestrate<S, KEYS extends string>(
    steps: Record<KEYS, Step<S, KEYS>>,
    start: KEYS
): Promise<S> {
    let step: KEYS | undefined = start;
    while (step && steps[step]) {
        const result: StepResult<S, KEYS> = await steps[step]();
        if (result.type === "error") {
            throw result.error;
        }

        if (result.type === "success") {
            return result.result;
        }

        if (result.next) {
            step = result.next;
        }
    }
    throw new Error("Missing return step");
}

type AzureStepName =
    | "tryLogin"
    | "findCli"
    | "installCli"
    | "isLoggedIn"
    | "loginAzureCli";

export class AzureCliCheck implements Disposable {
    private disposables: Disposable[] = [];

    constructor(
        private authProvider: AuthProvider,
        private azBinPath: string = "az"
    ) {}

    dispose() {
        this.disposables.forEach((i) => i.dispose());
        this.disposables = [];
    }

    public async check(silent = false): Promise<boolean> {
        let tenant: string;

        const steps: Record<AzureStepName, Step<boolean, AzureStepName>> = {
            tryLogin: async () => {
                const result = await this.tryLogin();
                if (typeof result === "string") {
                    tenant = result;
                    return {
                        type: "next",
                        next: "loginAzureCli",
                    };
                }
                if (result) {
                    return {
                        type: "success",
                        result: true,
                    };
                } else {
                    return {
                        type: "next",
                        next: "findCli",
                    };
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
                if (await this.loginAzureCli(tenant)) {
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
                "findCli"
            );
        } catch (e: any) {
            window.showErrorMessage(e.message);
            return false;
        }

        if (result && !silent) {
            window.showInformationMessage(
                "Databricks: Successfully logged in with Azure CLI"
            );
        }
        return result;
    }

    private async tryLogin(): Promise<boolean | string> {
        const apiClient = ConnectionManager.apiClientFrom(this.authProvider);
        try {
            await new CurrentUserService(apiClient).me();
        } catch (e: any) {
            // parse error message
            const m = e.message.match(
                /Expected iss claim to be: https:\/\/sts\.windows\.net\/([a-z0-9-]+?)\/?, but was: https:\/\/sts\.windows\.net\/([a-z0-9-]+)\/?/
            );
            if (m) {
                return m[1];
            }

            return false;
        }
        return true;
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
        } catch (e: any) {
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
        } catch (e: any) {
            return false;
        }
        return true;
    }

    // login using azure CLI
    public async loginAzureCli(tenant = ""): Promise<boolean> {
        let message = 'You need to run "az login" to login with Azure.';
        if (tenant) {
            message = `You are logged in with the wrong tenant ID. Run "az login -t ${tenant}" to login with Azure with the correct tenant.`;
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
            terminal.sendText(
                `${this.azBinPath} login ${
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
