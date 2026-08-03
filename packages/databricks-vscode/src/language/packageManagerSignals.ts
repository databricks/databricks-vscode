import fs from "node:fs";
import path from "node:path";
import {ResolvedEnvironment} from "./MsPythonExtensionApi";
import {
    interpreterUnderCondaPrefix,
    InterpreterSource,
    PackageManagerSignals,
    pyprojectHasPackagingTable,
    pyprojectHasToolSection,
    pyvenvCfgMarksUv,
} from "./packageManagerDetection";

/**
 * Optional sink for best-effort probe failures. A collector callsite that has a
 * logger (the telemetry emitter, the extension host) passes one so failed
 * probes are visible in debug logs; callers that don't (unit tests) omit it.
 * Every failure here is non-fatal — the signal simply degrades to absent.
 */
export type SignalDebugLog = (message: string, error: unknown) => void;

const noopLog: SignalDebugLog = () => {};

/**
 * Gather raw package-manager signals from disk and the resolved interpreter.
 *
 * Single-sourced collection layer: both {@link PackageManagerTelemetry} (for
 * the detection telemetry event) and the live python-setup gate detector call
 * this, so the two never drift. Pure w.r.t. its inputs apart from the disk
 * reads it performs; every probe is individually guarded so one failure
 * degrades that signal to absent/`false` rather than aborting the whole
 * collection or throwing into the caller's flow.
 */
export function collectPackageManagerSignals(
    projectRoot: string,
    env: ResolvedEnvironment | undefined,
    log: SignalDebugLog = noopLog
): PackageManagerSignals {
    const exists = (file: string) => fileExists(projectRoot, file, log);
    const interpreterSource = getInterpreterSource(env, log);
    const pyproject = readPyproject(projectRoot, log);

    const hasPyprojectToolUv = pyprojectHasToolSection(pyproject, "uv");
    const hasPyprojectToolPoetry = pyprojectHasToolSection(pyproject, "poetry");
    // Only attribute pip when the pyproject actually declares packaging
    // (`[project]`/`[build-system]`); a file with only tool config such as
    // `[tool.ruff]` is not a pip signal.
    const hasPyprojectPipOnly =
        pyprojectHasPackagingTable(pyproject) &&
        !hasPyprojectToolUv &&
        !hasPyprojectToolPoetry;

    return {
        hasUvLock: exists("uv.lock"),
        hasPyprojectToolUv,
        // uvOnPath is intentionally left unset: it is a weak signal that never
        // attributes a project to uv, and probing it would mean executing a
        // PATH-resolved `uv` binary purely for this classification.
        hasPoetryLock: exists("poetry.lock"),
        hasPyprojectToolPoetry,
        poetryOnPath: undefined,
        hasRequirementsTxt: hasRequirementsTxt(projectRoot, log),
        hasConstraintsTxt: exists("constraints.txt"),
        hasPyprojectPipOnly,
        hasCondaEnvFile:
            exists("environment.yml") || exists("environment.yaml"),
        hasCondaPrefix: hasActiveCondaInterpreter(env),
        interpreterSource,
    };
}

/**
 * Classify the *active interpreter's* provenance from the resolved environment
 * alone. This is deliberately independent of project files: a project carrying
 * `uv.lock` but running a conda/venv/system interpreter must report that
 * interpreter's real source, so the setup-flow gap ("uv project, interpreter
 * not uv-managed yet") stays visible. `uv.lock` is still captured as a strong
 * *project* signal via `hasUvLock`.
 */
function getInterpreterSource(
    env: ResolvedEnvironment | undefined,
    log: SignalDebugLog
): InterpreterSource {
    if (env?.environment === undefined) {
        // No managed environment: a global/system interpreter.
        return env ? "system" : "unknown";
    }

    const tools = env.tools ?? [];
    if (env.environment.type === "Conda" || tools.includes("Conda")) {
        return "conda";
    }
    // Poetry envs are venvs, but must be attributed to poetry rather than
    // collapsed into the generic venv (which the detector reads as pip).
    if (tools.includes("Poetry")) {
        return "poetry";
    }
    if (
        tools.includes("Venv") ||
        tools.includes("VirtualEnv") ||
        tools.includes("Pipenv") ||
        env.environment.type === "VirtualEnvironment"
    ) {
        // The MS Python extension reports uv-created venvs as plain virtual
        // environments. Distinguish a genuinely uv-provisioned interpreter by
        // the `uv = <version>` line uv writes into pyvenv.cfg -- this is
        // interpreter provenance, not the mere presence of uv.lock.
        return isUvCreatedVenv(env, log) ? "uv" : "venv";
    }
    return "unknown";
}

/**
 * True if the active venv's pyvenv.cfg marks it as uv-created. Thin fs wrapper
 * around the pure {@link pyvenvCfgMarksUv}.
 */
function isUvCreatedVenv(
    env: ResolvedEnvironment,
    log: SignalDebugLog
): boolean {
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
        log("Failed to read pyvenv.cfg", e);
        return false;
    }
}

/**
 * Whether the *active interpreter* lives under `CONDA_PREFIX`.
 *
 * We deliberately do NOT fire on the bare presence of `CONDA_PREFIX` /
 * `CONDA_DEFAULT_ENV`: those are session-global in the extension host (set for
 * every project when VS Code is launched from an activated conda shell), so
 * using them directly would over-count conda for uv/poetry/pip projects.
 * Requiring the active interpreter to reside under the prefix keeps this a
 * project-scoped signal.
 */
function hasActiveCondaInterpreter(
    env: ResolvedEnvironment | undefined
): boolean {
    return interpreterUnderCondaPrefix(
        env?.executable.sysPrefix,
        process.env["CONDA_PREFIX"]
    );
}

function fileExists(
    projectRoot: string,
    file: string,
    log: SignalDebugLog
): boolean {
    try {
        return fs.existsSync(path.join(projectRoot, file));
    } catch (e) {
        log(`Failed to stat ${file}`, e);
        return false;
    }
}

/**
 * True if any pip-style requirements file exists in the project root:
 * `requirements.txt` or a separator-suffixed variant such as
 * `requirements-dev.txt` / `requirements_test.txt` / `requirements.ci.txt`.
 * Deliberately does not match `requirementsfoo.txt` (no separator), which isn't
 * a conventional requirements file.
 */
function hasRequirementsTxt(projectRoot: string, log: SignalDebugLog): boolean {
    try {
        return fs
            .readdirSync(projectRoot)
            .some((name) => /^requirements([-_.].+)?\.txt$/.test(name));
    } catch (e) {
        log("Failed to list project root", e);
        return false;
    }
}

function readPyproject(
    projectRoot: string,
    log: SignalDebugLog
): string | undefined {
    try {
        const file = path.join(projectRoot, "pyproject.toml");
        if (!fs.existsSync(file)) {
            return undefined;
        }
        return fs.readFileSync(file, "utf-8");
    } catch (e) {
        log("Failed to read pyproject.toml", e);
        return undefined;
    }
}
