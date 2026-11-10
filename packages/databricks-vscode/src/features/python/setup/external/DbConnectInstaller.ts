import { UserFacingError } from "../../../../platform/errors";
import type { DbConnectInstallOutcome } from "../../telemetry";
import { suggestedDbConnectVersion, type ChecklistCompute } from "./checks";
import type { PackageOutput, Packages } from "./Packages";

export const DBCONNECT_CHANNEL = "Databricks Connect";

/** The "Databricks Connect" channel. */
export interface InstallChannel extends PackageOutput {
    clear(): void;
    show(): void;
}

/** The prompts the installer shows. */
interface InstallerUi {
    showInformationMessage(message: string, ...choices: string[]): Thenable<string | undefined>;
    /** `ctx.commands.showError`. */
    showError(error: UserFacingError): Promise<void>;
    showInputBox(options: { prompt: string; value: string }): Thenable<string | undefined>;
}

export interface DbConnectInstallerDeps {
    readonly packages: Packages;
    /** The project's interpreter (ms-python's selection). */
    executable(): Promise<string | undefined>;
    /** The selected environment's name, for the prompt. */
    environmentName(): Promise<string | undefined>;
    compute(): ChecklistCompute;
    channel(): InstallChannel;
    readonly ui: InstallerUi;
    /** "Change environment": `databricks.environment.selectPythonInterpreter`. */
    selectInterpreter(): Promise<void>;
    /** Starts the `python_env.dbconnect_install` clock. */
    startInstall(): (props: { outcome: DbConnectInstallOutcome }) => void;
    /** Re-evaluates readiness; awaited after every install attempt. */
    onInstalled(): Promise<unknown>;
}

/**
 * Installs Databricks Connect into the selected interpreter (PYENV-08): the
 * old `EnvironmentDependenciesInstaller`, with its strings. It removes
 * `pyspark` and any `databricks-connect` first, then installs
 * `databricks-connect==<version>` and `nbformat` (for `%run`), with the
 * output in the "Databricks Connect" channel.
 *
 * Every attempt ends by re-evaluating readiness, and resolves only once
 * that is done: the old installer fired an event and left the refresh
 * to a listener, which could miss it.
 *
 * Like the uv flow, it shows its own prompts and errors: it runs
 * from a notification's button as well as from commands.
 */
export class DbConnectInstaller {
    constructor(private readonly deps: DbConnectInstallerDeps) {}

    suggestedVersion(): string {
        return suggestedDbConnectVersion(this.deps.compute());
    }

    /** Installs `version`, or the suggested one. A failure is shown, logged in the channel and reported; it doesn't throw. */
    async install(version = this.suggestedVersion()): Promise<DbConnectInstallOutcome> {
        // Timed from here, so the duration is the pip work only, not the prompts before it.
        const report = this.deps.startInstall();
        const channel = this.deps.channel();
        let outcome: DbConnectInstallOutcome = "ok";
        try {
            channel.clear();
            channel.show();
            const executable = await this.deps.executable();
            if (executable === undefined) {
                throw new Error("No python executable found");
            }
            const { packages } = this.deps;
            await packages.uninstall(executable, "pyspark", channel);
            await packages.uninstall(executable, "databricks-connect", channel);
            await packages.install(executable, "databricks-connect", version, channel);
            // Required for executing notebooks with %run magic
            await packages.install(executable, "nbformat", undefined, channel);
        } catch (e) {
            outcome = "failed";
            if (e instanceof Error) {
                void this.deps.ui.showError(
                    new UserFacingError("DBCONNECT_INSTALL_FAILED", e.message, { cause: e }),
                );
            }
            channel.show();
        }
        report({ outcome });
        await this.deps.onInstalled();
        return outcome;
    }

    /** Asks for the version, suggesting `suggested` or the compute's; nothing happens when dismissed. */
    async installWithVersionPrompt(suggested?: string): Promise<void> {
        const version = await this.deps.ui.showInputBox({
            prompt: "Enter a version of the Databricks Connect",
            value: suggested || this.suggestedVersion(),
        });
        if (version) {
            await this.install(version);
        }
    }

    /**
     * The install prompt. `advertisement` is the wording offered when an
     * interpreter without Databricks Connect is selected; otherwise it is the
     * checklist row's.
     */
    async show(advertisement = false): Promise<void> {
        const executable = await this.deps.executable();
        const installed =
            executable === undefined
                ? []
                : await this.deps.packages.list(executable).catch(() => []);
        const hasPyspark = installed.some((p) => p.name === "pyspark");
        const dbConnect = installed.find((p) => p.name === "databricks-connect");
        const hasDbConnect = !hasPyspark && dbConnect !== undefined;
        const name = await this.deps.environmentName();

        const mainMessagePart = advertisement
            ? "Interactive debugging in PySpark is now available. Start using it by installing Databricks Connect in the"
            : "For interactive debugging and autocompletion you need Databricks Connect. Would you like to install it in the";
        const envMessagePart = name ? "environment " + name : "current environment";
        const suggestedVersion = this.suggestedVersion();
        const pkgUpdateMessagePart = hasPyspark
            ? "(pyspark will be uninstalled)"
            : hasDbConnect
              ? `(databricks-connect will be changed from ${dbConnect.version} to ${suggestedVersion})`
              : "";
        const message = `${mainMessagePart} ${envMessagePart}. ${pkgUpdateMessagePart}`;

        const choice = await this.deps.ui.showInformationMessage(
            message,
            "Install",
            "Change environment",
            "Change version",
        );
        switch (choice) {
            case "Install":
                await this.install(suggestedVersion);
                return;
            case "Change version":
                await this.installWithVersionPrompt(suggestedVersion);
                return;
            case "Change environment":
                await this.deps.selectInterpreter();
                return;
        }
    }
}
