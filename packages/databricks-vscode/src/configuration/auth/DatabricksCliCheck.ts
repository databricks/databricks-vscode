import {
    CancellationToken,
    Context,
    ProductVersion,
    WorkspaceClient,
    logging,
} from "@databricks/sdk-experimental";
import {
    CancellationToken as VscodeCancellationToken,
    Disposable,
    window,
} from "vscode";
import {DatabricksCliAuthProvider} from "./AuthProvider";
import {orchestrate, OrchestrationLoopError, Step} from "./orchestrate";
import {Loggers} from "../../logger";
import {execFile} from "../../cli/CliWrapper";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const extensionVersion = require("../../../package.json")
    .version as ProductVersion;

type StepName = "tryLogin" | "login";

/**
 * Upper bound (in seconds) for the interactive `auth login` browser challenge.
 *
 * The bundled CLI defaults this to 1 hour. In environments where the OAuth
 * browser/callback round-trip cannot complete (notably WSL, where the Linux
 * CLI cannot open the Windows browser or receive the localhost callback), that
 * default makes the extension appear to hang indefinitely on
 * "Attempting to configure auth: databricks-cli" (databricks-vscode#1917).
 *
 * Five minutes is comfortably longer than a human needs to complete a browser
 * login, but short enough that a broken environment fails fast with an
 * actionable error instead of stalling for an hour.
 */
export const LOGIN_TIMEOUT_SECONDS = 300;

/**
 * Subset of {@link execFile} used by this class, injectable for testing.
 */
export type ExecFile = (
    file: string,
    args: string[],
    options?: Record<string, unknown>,
    cancellationToken?: VscodeCancellationToken
) => Promise<{stdout: string; stderr: string}>;

export class DatabricksCliCheck implements Disposable {
    private disposables: Disposable[] = [];

    constructor(
        private authProvider: DatabricksCliAuthProvider,
        private readonly execFileFn: ExecFile = execFile
    ) {}

    dispose() {
        this.disposables.forEach((i) => i.dispose());
        this.disposables = [];
    }

    async check(cancellationToken?: CancellationToken): Promise<boolean> {
        const steps: Record<StepName, Step<boolean, StepName>> = {
            tryLogin: async () => {
                if (await this.tryLogin(cancellationToken)) {
                    return {type: "success", result: true};
                } else {
                    return {type: "next", next: "login"};
                }
            },
            login: async () => {
                try {
                    await this.login(cancellationToken);
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
        cancellationToken?: CancellationToken
    ): Promise<boolean> {
        const workspaceClient = new WorkspaceClient(
            {
                host: this.authProvider.host.toString(),
                authType: "databricks-cli",
                databricksCliPath: this.authProvider.cliPath,
                profile: this.authProvider.profile,
                ...(this.authProvider.workspaceId
                    ? {workspaceId: this.authProvider.workspaceId}
                    : {}),
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

    private async login(cancellationToken?: CancellationToken): Promise<void> {
        const host = this.authProvider.host.toString().replace(/\/+$/, "");
        const profile = this.authProvider.profile;
        const args = ["auth", "login"];
        if (profile) {
            args.push("--profile", profile);
        } else {
            args.push("--host", host);
        }
        // Bound the browser challenge so a non-completing OAuth flow (e.g. WSL)
        // fails fast instead of stalling on the CLI's 1-hour default.
        args.push("--timeout", `${LOGIN_TIMEOUT_SECONDS}s`);
        try {
            await this.execFileFn(
                this.authProvider.cliPath,
                args,
                {},
                cancellationToken
            );
        } catch (e: any) {
            // The CLI's interactive login can fail to complete in environments
            // where the browser/callback round-trip does not work (notably
            // WSL). Point the user at running the same command themselves in a
            // terminal, where the browser flow can be completed (or copied to
            // the host browser), instead of surfacing only the raw CLI error.
            const manualCommand = profile
                ? `databricks auth login --profile ${profile}`
                : `databricks auth login --host ${host}`;
            throw new Error(
                `Login failed with Databricks CLI: ${e.stderr || e.message}. ` +
                    `Try running \`${manualCommand}\` in a terminal to complete the login, then reload.`
            );
        }
    }
}
