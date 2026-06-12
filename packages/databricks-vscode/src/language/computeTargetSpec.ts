/**
 * Mapping between the selected compute (cluster DBR or serverless) and the
 * local Python version required by Databricks Connect. Databricks Connect
 * serializes UDFs with pickle, so the local Python minor version has to match
 * the Python on the remote compute.
 */

export interface RequiredPythonVersion {
    major: number;
    minor: number;
    /**
     * Whether the local minor version must match exactly for the feature to
     * work. True for serverless (remote Python is fixed per environment
     * version). For clusters a mismatch is reported as a warning to keep
     * non-UDF workloads usable.
     */
    exact: boolean;
    /** Human readable version, e.g. "3.12" */
    display: string;
    /** What the version requirement comes from, e.g. "the serverless environment" */
    source: string;
}

/**
 * Python version shipped with each DBR (and the matching databricks-connect)
 * major version. Versions not listed here (newer than the latest entry) fall
 * back to the latest entry.
 */
const dbrToPythonMinorVersion: Array<{
    minDbrMajor: number;
    pythonMinor: number;
}> = [
    {minDbrMajor: 16, pythonMinor: 12},
    {minDbrMajor: 15, pythonMinor: 11},
    {minDbrMajor: 13, pythonMinor: 10},
];

function pythonMinorForDbrMajor(dbrMajor: number): number | undefined {
    return dbrToPythonMinorVersion.find((m) => dbrMajor >= m.minDbrMajor)
        ?.pythonMinor;
}

export function getRequiredPythonVersion(input: {
    serverless: boolean;
    /** databricks.connect.serverlessDbconnectVersion setting, e.g. "17.3" */
    serverlessDbconnectVersion: string;
    /** cluster DBR version parts, e.g. [15, 4] */
    dbrVersion?: (number | "x")[];
}): RequiredPythonVersion | undefined {
    let dbrMajor: number | "x" | undefined;
    let exact = false;
    let source: string;
    if (input.serverless) {
        dbrMajor = parseInt(input.serverlessDbconnectVersion.split(".")[0], 10);
        if (isNaN(dbrMajor)) {
            return undefined;
        }
        exact = true;
        source = "the serverless environment";
    } else {
        dbrMajor = input.dbrVersion?.[0];
        source = `DBR ${dbrMajor}`;
    }
    if (dbrMajor === undefined || dbrMajor === "x") {
        return undefined;
    }
    const minor = pythonMinorForDbrMajor(dbrMajor);
    if (minor === undefined) {
        return undefined;
    }
    return {
        major: 3,
        minor,
        exact,
        display: `3.${minor}`,
        source,
    };
}

export interface ComputeTargetSpec {
    computeType: "serverless" | "cluster";
    pythonVersion: RequiredPythonVersion;
    /** databricks-connect pip version specifier, e.g. "17.3.*" */
    dbconnectVersion: string;
}

/**
 * Resolves everything the extension needs to provision a working environment
 * for the selected compute: the local Python version and the matching
 * databricks-connect version. Returns undefined when the compute doesn't
 * support Databricks Connect or its version can't be determined; callers
 * should fall back to the manual setup flow in that case.
 */
export function resolveComputeTargetSpec(input: {
    serverless: boolean;
    serverlessDbconnectVersion: string;
    dbrVersion?: (number | "x")[];
}): ComputeTargetSpec | undefined {
    const pythonVersion = getRequiredPythonVersion(input);
    if (!pythonVersion) {
        return undefined;
    }
    if (input.serverless) {
        const parts = input.serverlessDbconnectVersion.split(".");
        const major = parts[0];
        const minor = parts[1] ?? "3";
        return {
            computeType: "serverless",
            pythonVersion,
            dbconnectVersion: `${major}.${minor}.*`,
        };
    }
    const [major, minor] = input.dbrVersion ?? [];
    if (major === undefined || major === "x") {
        return undefined;
    }
    return {
        computeType: "cluster",
        pythonVersion,
        dbconnectVersion:
            minor === "x" || minor === undefined
                ? `${major}.*`
                : `${major}.${minor}.*`,
    };
}
