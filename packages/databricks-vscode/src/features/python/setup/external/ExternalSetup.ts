import { UserFacingError } from "../../../../platform/errors";
import type { Environment } from "../../msPythonApi";
import { PYTHON } from "../../../../kernel/extensionDependencies";
import type { ExtensionDependencies } from "../../../../platform/extensions";
import type { CheckAction, Readiness, ReadinessCheck } from "../readiness";
import { reinstallPlaceholder, type ChecklistCompute } from "./checks";
import type { DbConnectInstaller } from "./DbConnectInstaller";

export const CREATE_NEW_ENVIRONMENT_LABEL = "$(add) Create new environment";
export const USE_PYTHON_EXTENSION_LABEL = "$(gear) Use Python Extension to setup environments";

export interface EnvironmentPick {
    readonly label: string;
    readonly description?: string;
    readonly alwaysShow?: boolean;
    readonly path?: string;
}

/** The prompts the checklist shows. */
interface ExternalSetupUi {
    showInformationMessage(message: string): Thenable<unknown>;
    showQuickPick(
        items: EnvironmentPick[],
        options: { title: string },
    ): Thenable<EnvironmentPick | undefined>;
}

export interface ExternalSetupDeps {
    /** The last readiness, if evaluated. */
    readiness(): Readiness | undefined;
    /** Re-evaluates readiness, with the "checking" notification when `progress` is set. */
    refresh(progress: boolean): Promise<Readiness | undefined>;
    readonly python: {
        availableEnvironments(): Promise<Environment[]>;
        createEnvironment(): Promise<void>;
        selectInterpreter(): Promise<void>;
        setActiveEnvironmentPath(path: string): Promise<void>;
    };
    /** Throws when ms-python, which finds and selects the interpreters, is missing or disabled. */
    readonly requireExtension: ExtensionDependencies["require"];
    readonly installer: DbConnectInstaller;
    compute(): ChecklistCompute;
    /** The compute picker, with why the current compute won't do. */
    attachCluster(message: string | undefined): Promise<void>;
    /** `databricks.autocomplete.configure`: offers the builtins file. */
    configureAutocomplete(): Promise<void>;
    readonly ui: ExternalSetupUi;
}

/** The old `environmentName`: `3.12.4 .venv`, or the path for a global interpreter. */
export function environmentName(env: Environment): string {
    const version = env.version
        ? `${env.version.major}.${env.version.minor}.${env.version.micro} `
        : "";
    return `${version}${env.environment?.name ?? env.path}`;
}

/** The Databricks Connect row offers the install: an interpreter passes, and the package is missing. */
function needsInstall(readiness: Readiness): boolean {
    return readiness.checks.some(
        (c) => c.id === "checkEnvironmentDependencies" && c.action === "installDbConnect",
    );
}

/**
 * The external strategy's actions (PYENV-07, PYENV-08): the old
 * `EnvironmentCommands`, over the session's readiness instead of the
 * `FeatureManager`. "Setup python environment" takes the first failing
 * row's action (or the one for `stepId`), checks again and reports.
 *
 * One change: when the interpreter step leaves only Databricks Connect
 * missing, it offers the install (once per interpreter, shared with the
 * prompt on an interpreter change) instead of reporting a failure, so a new
 * environment is followed by one "Install" prompt, not that prompt and an
 * error that both mention Databricks Connect.
 */
export class ExternalSetup {
    /** Interpreters the install prompt was offered for, this session. */
    private readonly offered = new Set<string>();

    constructor(private readonly deps: ExternalSetupDeps) {}

    async setup(stepId?: string): Promise<void> {
        // The cached state: the action re-checks.
        let readiness = this.deps.readiness() ?? (await this.deps.refresh(false));
        if (readiness === undefined) {
            return;
        }
        let ran: CheckAction | undefined;
        const step = readiness.checks.find(
            (c) =>
                !c.available && (stepId === undefined || c.id === stepId) && c.action !== undefined,
        );
        if (step?.action !== undefined) {
            // Actions usually need input and can be dismissed, so stop after one,
            // and let the user carry on from the rows.
            ran = step.action;
            await this.run(step);
            readiness = await this.deps.refresh(true);
            if (readiness === undefined) {
                return;
            }
        }
        if (readiness.status === "ready") {
            void this.deps.ui.showInformationMessage(
                "Python environment and Databricks Connect are set up.",
            );
            return;
        }
        if (ran === "selectInterpreter" && needsInstall(readiness)) {
            void this.offerInstall(readiness, false);
            return;
        }
        const detail = readiness.checks
            .filter((c) => !c.available && !c.optional && (c.message || c.title))
            .map((c) => c.message || c.title)
            .join("\n");
        throw new UserFacingError(
            "PYTHON_ENVIRONMENT_NOT_READY",
            `Failed to set up Python environment for Databricks Connect:\n${detail}`,
        );
    }

    /**
     * Offers to install Databricks Connect, once per interpreter: after an
     * interpreter change (`advertisement`) or a setup that selected one.
     */
    async offerInstall(readiness: Readiness, advertisement: boolean): Promise<void> {
        const interpreter = readiness.interpreter?.path;
        if (
            readiness.strategy !== "external" ||
            interpreter === undefined ||
            this.offered.has(interpreter) ||
            !needsInstall(readiness)
        ) {
            return;
        }
        this.offered.add(interpreter);
        await this.deps.installer.show(advertisement);
    }

    /** `databricks.environment.selectPythonInterpreter`: our picker, or ms-python's create flow when there is nothing to pick. */
    async selectPythonInterpreter(): Promise<void> {
        this.deps.requireExtension(PYTHON, "Selecting a Python interpreter");
        const environments = await this.deps.python.availableEnvironments();
        if (environments.length === 0) {
            await this.deps.python.createEnvironment();
            return;
        }
        const picks: EnvironmentPick[] = [
            ...environments.map((env) => ({
                label: environmentName(env),
                description: env.path,
                path: env.path,
            })),
            { label: CREATE_NEW_ENVIRONMENT_LABEL, alwaysShow: true },
            { label: USE_PYTHON_EXTENSION_LABEL, alwaysShow: true },
        ];
        const picked = await this.deps.ui.showQuickPick(picks, {
            title: "Select Python Environment",
        });
        if (picked === undefined) {
            return;
        }
        if (picked.label === CREATE_NEW_ENVIRONMENT_LABEL) {
            await this.deps.python.createEnvironment();
        } else if (picked.label === USE_PYTHON_EXTENSION_LABEL) {
            await this.deps.python.selectInterpreter();
        } else if (picked.path !== undefined) {
            await this.deps.python.setActiveEnvironmentPath(picked.path);
        }
    }

    /** `databricks.environment.reinstallDBConnect`: asks for the version, suggesting the cluster's runtime. */
    async reinstallDbConnect(): Promise<void> {
        this.deps.requireExtension(PYTHON, "Reinstalling Databricks Connect");
        const readiness = this.deps.readiness() ?? (await this.deps.refresh(false));
        const interpreterReady =
            readiness?.strategy === "external"
                ? readiness.checks.some((c) => c.id === "checkPythonEnvironment" && c.available)
                : readiness?.interpreter?.path !== undefined;
        if (!interpreterReady) {
            throw new UserFacingError(
                "NO_PYTHON_ENVIRONMENT",
                "Activate a python environment first.",
            );
        }
        await this.deps.installer.installWithVersionPrompt(
            reinstallPlaceholder(this.deps.compute()),
        );
    }

    private async run(check: ReadinessCheck): Promise<void> {
        switch (check.action) {
            case "selectInterpreter":
                return this.selectPythonInterpreter();
            case "attachCluster":
                return this.deps.attachCluster(check.actionMessage);
            case "installDbConnect":
                return this.deps.installer.show(false);
            case "reinstallDbConnect":
                return this.reinstallDbConnect();
            case "configureAutocomplete":
                return this.deps.configureAutocomplete();
            case "recheck":
            case undefined:
                return;
        }
    }
}
