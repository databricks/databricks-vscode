/**
 * Builders for failed `environments setup-local` results, shared by the tests
 * that decide how a failure is shown and whether it is worth reporting.
 * Unlike setupLocalResults.ts, these are not CLI goldens.
 */

import { PythonSetupErrorCode, PythonSetupResult } from "../result";

/**
 * A uv "package index unreachable" error message, mirroring the real CLI text a
 * locked-down corporate machine produces when pypi.org is blocked (see the
 * `os error 61` / connection-refused signature). This network-blocked variant
 * of E_PROVISION gets proxy guidance and is not report-worthy.
 */
export const INDEX_UNREACHABLE_CLI_MSG =
    "Using CPython 3.12.8\n" +
    "error: Failed to fetch: `https://pypi.org/simple/ipykernel/`\n" +
    "  Caused by: tcp connect error: Connection refused (os error 61)";

/**
 * The real CLI text for `errNoProjectTable` (libs/localenv): the merge phase
 * refuses to write requires-python because the pyproject.toml has no [project]
 * table. Wrapped by the "merge managed regions failed:" prefix exactly as it
 * reaches the user (see databricks/databricks-vscode#2177). This user-fixable
 * variant of E_MERGE is not report-worthy, unlike a generic E_MERGE.
 */
export const NO_PROJECT_TABLE_CLI_MSG =
    "merge managed regions failed: pyproject.toml has no [project] table to hold requires-python";

/** Build a minimal failed result carrying a specific error. */
export function failure(
    code: PythonSetupErrorCode,
    extra: Partial<NonNullable<PythonSetupResult["error"]>> = {},
    resultExtra: Partial<PythonSetupResult> = {},
): PythonSetupResult {
    return {
        schemaVersion: 1,
        command: "environments setup-local",
        ok: false,
        mode: "default",
        dryRun: false,
        greenfield: false,
        phases: [],
        warnings: [],
        durationMs: 0,
        error: {
            code,
            failurePhase: "provision",
            message: "raw cli detail",
            diskMutated: false,
            ...extra,
        },
        ...resultExtra,
    };
}
