import fs from "node:fs";
import path from "node:path";
import {NamedLogger} from "@databricks/sdk-experimental/dist/logging";
import {Loggers} from "../logger";
import {Telemetry} from "../telemetry";
import {ComputeType, SetupTrigger} from "../telemetry/constants";
import "../telemetry/packageManagerExtensions";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {ResolvedEnvironment} from "./MsPythonExtensionApi";
import {
    detectPackageManagers,
    interpreterUnderCondaPrefix,
    InterpreterSource,
    PackageManagerSignals,
    pyprojectHasToolSection,
    pyvenvCfgMarksUv,
} from "./packageManagerDetection";

export type {SetupTrigger};

/**
 * Collects package-manager signals at project-setup touchpoints and emits the
 * {@link Events.PYTHON_ENV_SETUP_DETECTED} telemetry event.
 *
 * All probing is best-effort and non-blocking: any failure degrades to
 * `unknown` and is swallowed, never thrown into the user's setup/run flow.
 * Only categorical/enum data is emitted — no paths, package names, or other
 * free-form content (see {@link detectPackageManagers}). Telemetry opt-out is
 * honoured by the underlying {@link Telemetry} client.
 */
export class PackageManagerTelemetry {
    private readonly logger = NamedLogger.getOrCreate(Loggers.Extension);

    /**
     * Triggers already emitted for the current `(project, trigger)` pair, to
     * deduplicate within a session so one project open doesn't inflate counts.
     */
    private readonly emitted = new Set<string>();

    constructor(
        private readonly telemetry: Telemetry,
        private readonly pythonExtension: MsPythonExtensionWrapper,
        private readonly getProjectRoot: () => string | undefined,
        private readonly getComputeType: () => ComputeType | "none",
        private readonly isConnected: () => boolean
    ) {}

    /**
     * Detect the package manager(s) for the active project and emit telemetry.
     * Deduplicated per `(project root, trigger)` within the session. Only emits
     * while connected to a Databricks workspace, so the data describes active
     * users' projects (not extension installs that never authenticate). Never
     * throws.
     */
    async emitDetection(trigger: SetupTrigger): Promise<void> {
        try {
            // Bail before any disk access when telemetry is disabled, so an
            // opted-out user gets zero telemetry-driven file reads (not just a
            // dropped send).
            if (!this.telemetry.isTelemetryEnabled) {
                return;
            }
            const projectRoot = this.getProjectRoot();
            if (projectRoot === undefined) {
                return;
            }
            // Only report for authenticated sessions. Checked before the dedupe
            // bookkeeping so a pre-connect call doesn't consume the dedupe slot
            // and suppress the real emit once connected.
            if (!this.isConnected()) {
                return;
            }
            const dedupeKey = `${trigger}:${projectRoot}`;
            if (this.emitted.has(dedupeKey)) {
                return;
            }
            this.emitted.add(dedupeKey);

            const env = await this.resolveEnvironment();
            const signals = this.collectSignals(projectRoot, env);
            const detection = detectPackageManagers(signals);

            this.telemetry.recordPackageManagerDetection(detection, {
                pythonVersion: this.getPythonMinorVersion(env),
                targetCompute: this.getComputeType(),
                trigger,
            });
        } catch (e) {
            // Detection is measurement-only and must never disrupt setup.
            this.logger.debug("Package manager detection failed", e);
        }
    }

    private async resolveEnvironment(): Promise<
        ResolvedEnvironment | undefined
    > {
        try {
            return await this.pythonExtension.pythonEnvironment;
        } catch (e) {
            this.logger.debug("Failed to resolve python environment", e);
            return undefined;
        }
    }

    /** Detected interpreter minor version (e.g. "3.11"), if available. */
    private getPythonMinorVersion(
        env: ResolvedEnvironment | undefined
    ): string | undefined {
        const version = env?.version;
        if (version?.major === undefined || version.minor === undefined) {
            return undefined;
        }
        return `${version.major}.${version.minor}`;
    }

    /**
     * Classify the *active interpreter's* provenance from the resolved
     * environment alone. This is deliberately independent of project files: a
     * project carrying `uv.lock` but running a conda/venv/system interpreter
     * must report that interpreter's real source, so the setup-flow gap ("uv
     * project, interpreter not uv-managed yet") stays visible. `uv.lock` is
     * still captured as a strong *project* signal via `hasUvLock`.
     */
    private getInterpreterSource(
        env: ResolvedEnvironment | undefined
    ): InterpreterSource {
        if (env?.environment === undefined) {
            // No managed environment: a global/system interpreter.
            return env ? "system" : "unknown";
        }

        const tools = env.tools ?? [];
        if (env.environment.type === "Conda" || tools.includes("Conda")) {
            return "conda";
        }
        if (
            tools.includes("Venv") ||
            tools.includes("VirtualEnv") ||
            tools.includes("Poetry") ||
            tools.includes("Pipenv") ||
            env.environment.type === "VirtualEnvironment"
        ) {
            // The MS Python extension reports uv-created venvs as plain virtual
            // environments. Distinguish a genuinely uv-provisioned interpreter
            // by the `uv = <version>` line uv writes into pyvenv.cfg -- this is
            // interpreter provenance, not the mere presence of uv.lock.
            return this.isUvCreatedVenv(env) ? "uv" : "venv";
        }
        return "unknown";
    }

    /**
     * True if the active venv's pyvenv.cfg marks it as uv-created. Thin fs
     * wrapper around the pure {@link pyvenvCfgMarksUv}.
     */
    private isUvCreatedVenv(env: ResolvedEnvironment): boolean {
        try {
            const sysPrefix = env.executable.sysPrefix;
            if (!sysPrefix) {
                return false;
            }
            const cfg = path.join(sysPrefix, "pyvenv.cfg");
            if (!fs.existsSync(cfg)) {
                return false;
            }
            return pyvenvCfgMarksUv(fs.readFileSync(cfg, "utf-8"));
        } catch (e) {
            this.logger.debug("Failed to read pyvenv.cfg", e);
            return false;
        }
    }

    /**
     * Gather raw signals from disk and the environment. Each probe is guarded
     * so a single failure degrades that signal to absent rather than aborting.
     */
    private collectSignals(
        projectRoot: string,
        env: ResolvedEnvironment | undefined
    ): PackageManagerSignals {
        const exists = (file: string) => this.fileExists(projectRoot, file);
        const interpreterSource = this.getInterpreterSource(env);
        const pyproject = this.readPyproject(projectRoot);

        const hasPyprojectToolUv = pyprojectHasToolSection(pyproject, "uv");
        const hasPyprojectToolPoetry = pyprojectHasToolSection(
            pyproject,
            "poetry"
        );
        const hasPyprojectPipOnly =
            pyproject !== undefined &&
            !hasPyprojectToolUv &&
            !hasPyprojectToolPoetry;

        return {
            hasUvLock: exists("uv.lock"),
            hasPyprojectToolUv,
            // uvOnPath is intentionally left unset: it is a weak signal that
            // never attributes a project to uv, and probing it would mean
            // executing a PATH-resolved `uv` binary purely for telemetry.
            hasPoetryLock: exists("poetry.lock"),
            hasPyprojectToolPoetry,
            poetryOnPath: undefined,
            hasRequirementsTxt: this.hasRequirementsTxt(projectRoot),
            hasConstraintsTxt: exists("constraints.txt"),
            hasPyprojectPipOnly,
            hasCondaEnvFile:
                exists("environment.yml") || exists("environment.yaml"),
            hasCondaPrefix: this.hasActiveCondaInterpreter(env),
            interpreterSource,
        };
    }

    /**
     * Whether the *active interpreter* lives under `CONDA_PREFIX`.
     *
     * We deliberately do NOT fire on the bare presence of `CONDA_PREFIX` /
     * `CONDA_DEFAULT_ENV`: those are session-global in the extension host (set
     * for every project when VS Code is launched from an activated conda
     * shell), so using them directly would over-count conda for uv/poetry/pip
     * projects. Requiring the active interpreter to reside under the prefix
     * keeps this a project-scoped signal.
     */
    private hasActiveCondaInterpreter(
        env: ResolvedEnvironment | undefined
    ): boolean {
        return interpreterUnderCondaPrefix(
            env?.executable.sysPrefix,
            process.env["CONDA_PREFIX"]
        );
    }

    private fileExists(projectRoot: string, file: string): boolean {
        try {
            return fs.existsSync(path.join(projectRoot, file));
        } catch (e) {
            this.logger.debug(`Failed to stat ${file}`, e);
            return false;
        }
    }

    /**
     * True if any pip-style requirements file exists in the project root:
     * `requirements.txt` or a separator-suffixed variant such as
     * `requirements-dev.txt` / `requirements_test.txt` / `requirements.ci.txt`.
     * Deliberately does not match `requirementsfoo.txt` (no separator), which
     * isn't a conventional requirements file.
     */
    private hasRequirementsTxt(projectRoot: string): boolean {
        try {
            return fs
                .readdirSync(projectRoot)
                .some((name) => /^requirements([-_.].+)?\.txt$/.test(name));
        } catch (e) {
            this.logger.debug("Failed to list project root", e);
            return false;
        }
    }

    private readPyproject(projectRoot: string): string | undefined {
        try {
            const file = path.join(projectRoot, "pyproject.toml");
            if (!fs.existsSync(file)) {
                return undefined;
            }
            return fs.readFileSync(file, "utf-8");
        } catch (e) {
            this.logger.debug("Failed to read pyproject.toml", e);
            return undefined;
        }
    }
}
