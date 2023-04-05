import {
    ExecUtils,
    ProductVersion,
    WorkspaceClient,
} from "@databricks/databricks-sdk";
import {Disposable, window} from "vscode";
import {BricksCliAuthProvider} from "./AuthProvider";
import {orchestrate, OrchestrationLoopError, Step} from "./orchestrate";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const extensionVersion = require("../../../package.json")
    .version as ProductVersion;

type StepName = "tryLogin" | "login";

export class BricksCliCheck implements Disposable {
    private disposables: Disposable[] = [];

    constructor(private authProvider: BricksCliAuthProvider) {}

    dispose() {
        this.disposables.forEach((i) => i.dispose());
        this.disposables = [];
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
                await this.login();
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
                host: this.authProvider.host.toString(),
                authType: "bricks-cli",
                bricksCliPath: this.authProvider.bricksPath,
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

    private async login(): Promise<boolean> {
        try {
            await ExecUtils.execFile(this.authProvider.bricksPath, [
                "auth",
                "login",
                "--host",
                this.authProvider.host.toString(),
            ]);
            return true;
        } catch (e: any) {
            window.showErrorMessage(
                `Error while running "bricks auth login": ${e.message}`
            );

            return false;
        }
    }
}
