import type { PythonSetupResult } from "../../../../kernel/cli/commands/environments";

/*
 * The `setup-local` contract the uv flow reads. The schema and the CLI call
 * are in `kernel/cli/commands/environments.ts`; this re-exports its types
 * under the names the ported modules use.
 */
export type {
    PythonSetupComputeInfo,
    PythonSetupErrorCode,
    PythonSetupResult,
    PythonSetupWarning,
    SetupLocalInvocation,
} from "../../../../kernel/cli/commands/environments";

/** Whether a parsed result represents a successful run. */
export function isPythonSetupSuccess(r: PythonSetupResult): boolean {
    return r.ok;
}
