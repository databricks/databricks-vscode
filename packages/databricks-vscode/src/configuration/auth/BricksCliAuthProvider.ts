import {
    Config,
    ExecUtils,
    ProductVersion,
    WorkspaceClient,
} from "@databricks/databricks-sdk";
import {Disposable, window} from "vscode";
import {AuthProvider} from "./AuthProvider";
import {orchestrate, OrchestrationLoopError, Step} from "./orchestrate";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const extensionVersion = require("../../../package.json")
    .version as ProductVersion;

type StepName = "tryLogin" | "login";

export class BricksCliAuthProvider extends AuthProvider {
    private disposables: Disposable[] = [];

    constructor(host: URL, private readonly bricksPath: string) {
        super(host, "bricks-cli");
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
        this.disposables = [];
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

    async getSdkConfig(): Promise<Config> {
        return new Config({
            host: this.host.toString(),
            authType: "bricks-cli",
            bricksCliPath: this.bricksPath,
        });
    }

    async check(silent: boolean): Promise<boolean> {
        const steps: Record<StepName, Step<boolean, StepName>> = {
            tryLogin: async () => {
                if (await this.tryLogin()) {
                    return {type: "success", result: true};
                } else {
                    return {type: "next", next: "login"};
                }
            },
            login: async () => {
                try {
                    await this.login();
                } catch (e: any) {
                    return {
                        type: "error",
                        error: e,
                    };
                }
                return {type: "next", next: "tryLogin"};
            },
        };

        let result: boolean;
        try {
            result = await orchestrate(steps, "tryLogin", 6);
        } catch (e: any) {
            let message: string;
            if (e instanceof OrchestrationLoopError) {
                message = "Can't login using Bricks CLI";
            } else {
                message = e.message;
            }

            window.showErrorMessage(message);
            return false;
        }

        if (result && !silent) {
            window.showInformationMessage(
                "Databricks: Successfully logged in with Bricks CLI"
            );
        }

        return result;
    }

    private async tryLogin(): Promise<boolean> {
        const workspaceClient = new WorkspaceClient(
            {
                host: this.host.toString(),
                authType: "bricks-cli",
                bricksCliPath: this.bricksPath,
            },
            {
                product: "databricks-vscode",
                productVersion: extensionVersion,
            }
        );

        try {
            await workspaceClient.currentUser.me();
        } catch (e: any) {
            return false;
        }

        return true;
    }

    private async login(): Promise<void> {
        try {
            await ExecUtils.execFile(this.bricksPath, [
                "auth",
                "login",
                "--host",
                this.host.toString(),
            ]);
        } catch (e: any) {
            throw new Error(
                `Login failed with Bricks CLI failed: ${e.stderr || e.message}`
            );
        }
    }
}
