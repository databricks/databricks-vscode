import type { ResolvedEnvironment } from "../../msPythonApi";
import type { ReadinessCheck } from "../readiness";

/** What the interpreter is checked against: the attached cluster's runtime, or serverless. */
export type InterpreterCompute =
    | { readonly kind: "cluster"; readonly dbrVersion: readonly (number | "x")[] }
    /** `databricks.connect.serverlessDbconnectVersion`, e.g. `17.3`. */
    | { readonly kind: "serverless"; readonly dbConnectVersion: string };

const ID = "checkPythonEnvironment";

function matchEnvironmentVersion(
    env: ResolvedEnvironment | undefined,
    major: number,
    minor: number,
): boolean {
    if (!env || !env.version || !env.environment) {
        return false;
    }
    return env.version.major === major && env.version.minor === minor;
}

function currentPythonVersionMessage(env?: ResolvedEnvironment): string {
    return env?.version && env.environment
        ? `Current Python version is ${env.version.major}.${env.version.minor}.${env.version.micro}.`
        : "No active environments found.";
}

function expectedPythonVersion(dbrVersionParts: readonly (number | "x")[]): string {
    if (dbrVersionParts[0] === 13 || dbrVersionParts[0] === 14) {
        return "3.10";
    }
    if (dbrVersionParts[0] === 15) {
        return "3.11";
    }
    if (dbrVersionParts[0] === 16) {
        return "3.12";
    }
    if (dbrVersionParts[0] !== "x" && dbrVersionParts[0] !== undefined && dbrVersionParts[0] > 16) {
        return "3.12";
    }
    return "3.10";
}

function versionMismatchWarning(
    dbrMajor: "x" | number | undefined,
    env: ResolvedEnvironment,
    current: string,
): string | undefined {
    if ((dbrMajor === 13 || dbrMajor === 14) && !matchEnvironmentVersion(env, 3, 10)) {
        return `Use python 3.10 to match DBR ${dbrMajor} requirements. ${current}`;
    }
    if (dbrMajor === 15 && !matchEnvironmentVersion(env, 3, 11)) {
        return `Use python 3.11 to match DBR ${dbrMajor} requirements. ${current}`;
    }
    if (dbrMajor === 16 && !matchEnvironmentVersion(env, 3, 12)) {
        return `Use python 3.12 to match DBR ${dbrMajor} requirements. ${current}`;
    }
    return undefined;
}

/**
 * The checklist's "Python environment" row: the old
 * `EnvironmentDependenciesVerifier.checkPythonEnvironment`, as a pure
 * function with the same strings and version table. A global interpreter
 * (no `environment`) doesn't pass, as before. Without the Python extension
 * (`pythonExtension` false) the row says so instead. The other rows are in
 * `checks.ts`.
 */
export function checkPythonEnvironment(
    env: ResolvedEnvironment | undefined,
    compute: InterpreterCompute | undefined,
    pythonExtension = true,
): ReadinessCheck {
    if (!pythonExtension) {
        // Its action then says the extension is needed, and offers to install it.
        return {
            id: ID,
            available: false,
            title: "Install the Python extension",
            message:
                "Databricks Connect finds the Python interpreter through the Python extension (ms-python.python), which is missing or disabled.",
            action: "selectInterpreter",
        };
    }
    let envVersionTooLow =
        env?.version !== undefined && (env.version.major !== 3 || env.version.minor < 10);
    let dbrVersion: readonly (number | "x")[] =
        compute?.kind === "cluster" ? compute.dbrVersion : [];
    if (compute?.kind === "serverless") {
        const parts = compute.dbConnectVersion.split(".");
        const serverlessMajor = parseInt(parts[0] ?? "", 10);
        const serverlessMinor = parseInt(parts[1] ?? "0", 10);
        dbrVersion = [serverlessMajor, serverlessMinor];
        const minPythonMinor = serverlessMajor >= 16 ? 12 : 11;
        envVersionTooLow =
            env?.version !== undefined &&
            (env.version.major !== 3 || env.version.minor < minPythonMinor);
    }
    const expected = expectedPythonVersion(dbrVersion);
    if (!env?.environment || envVersionTooLow) {
        return {
            id: ID,
            available: false,
            title: `Activate an environment with Python ${expected}`,
            message: `Databricks Connect requires Python ${expected}. ${currentPythonVersionMessage(env)}`,
            action: "selectInterpreter",
        };
    }
    const executable = env.executable.uri?.fsPath;
    if (!executable) {
        return {
            id: ID,
            available: false,
            title: `Activate an environment with Python ${expected}`,
            message: "No Python executable found.",
            action: "selectInterpreter",
        };
    }
    return {
        id: ID,
        available: true,
        title: `Active Environment: ${env.environment.name}`,
        message: executable,
        warning: versionMismatchWarning(dbrVersion[0], env, currentPythonVersionMessage(env)),
    };
}
