import {
    ProductVersion,
    WorkspaceClient,
    logging,
} from "@databricks/databricks-sdk";
import {Disposable, window} from "vscode";
import {DatabricksCliAuthProvider} from "./AuthProvider";
import {orchestrate, OrchestrationLoopError, Step} from "./orchestrate";
import {Loggers} from "../../logger";
import {execFile} from "../../cli/CliWrapper";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const extensionVersion = require("../../../package.json")
    .version as ProductVersion;

type StepName = "tryLogin" | "login";

export class DatabricksCliCheck implements Disposable {
    private disposables: Disposable[] = [];

    constructor(private authProvider: DatabricksCliAuthProvider) {}

    dispose() {
        this.disposables.forEach((i) => i.dispose());
        this.disposables = [];
    }

    async check(): Promise<boolean> {
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
                message = "Can't login using Databricks CLI";
            } else {
                message = e.message;
            }
            logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                message,
                e
            );
            window.showErrorMessage(message);
            return false;
        }

        return result;
    }

    private async tryLogin(): Promise<boolean> {
        const workspaceClient = new WorkspaceClient(
            {
                host: this.authProvider.host.toString(),
                authType: "databricks-cli",
                databricksCliPath: this.authProvider.cliPath,
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
            await execFile(this.authProvider.cliPath, [
                "auth",
                "login",
                "--host",
                this.authProvider.host.toString(),
            ]);
        } catch (e: any) {
            throw new Error(
                `Login failed with Databricks CLI failed: ${
                    e.stderr || e.message
                }`
            );
        }
    }
}
