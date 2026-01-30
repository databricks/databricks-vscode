import {
    CancellationToken,
    Context,
    ProductVersion,
    WorkspaceClient,
    logging,
} from "@databricks/sdk-experimental";
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

    async check(
        profile?: string,
        cancellationToken?: CancellationToken
    ): Promise<boolean> {
        const steps: Record<StepName, Step<boolean, StepName>> = {
            tryLogin: async () => {
                if (await this.tryLogin(profile, cancellationToken)) {
                    return {type: "success", result: true};
                } else {
                    return {type: "next", next: "login"};
                }
            },
            login: async () => {
                try {
                    await this.login(profile, cancellationToken);
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
            result = await orchestrate(
                steps,
                "tryLogin",
                6,
                undefined,
                cancellationToken
            );
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

    private async tryLogin(
        profile?: string,
        cancellationToken?: CancellationToken
    ): Promise<boolean> {
        const workspaceClient = new WorkspaceClient(
            {
                host: this.authProvider.host.toString(),
                authType: "databricks-cli",
                databricksCliPath: this.authProvider.cliPath,
                profile,
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
            return false;
        }

        return true;
    }

    private async login(
        profile?: string,
        cancellationToken?: CancellationToken
    ): Promise<void> {
        try {
            const host = this.authProvider.host.toString().replace(/\/+$/, "");
            const args = ["auth", "login", "--experimental-is-unified-host"];
            if (profile) {
                args.push("--profile", profile);
            } else {
                args.push("--host", host);
            }
            await execFile(
                this.authProvider.cliPath,
                args,
                {},
                cancellationToken
            );
        } catch (e: any) {
            throw new Error(
                `Login failed with Databricks CLI: ${e.stderr || e.message}`
            );
        }
    }
}
