import {ConfigurationTarget} from "vscode";
import type {PythonEnvironmentSetupMode} from "../../vscode-objs/WorkspaceConfigs";
import type {
    PythonSetupOptOutScope,
    PythonSetupOptOutSource,
} from "../../telemetry/constants";

/**
 * Collaborators for {@link optOutOfAutomatedPythonSetup}, injected so the
 * decision logic (transition detection, scope, record-on-success) is unit-tested
 * without VS Code globals.
 */
export interface ManualSetupOptOutDeps {
    /** The effective setup mode, read before the write to detect a transition. */
    currentMode: () => PythonEnvironmentSetupMode;
    /** Whether a workspace folder is open; decides the scope and target. */
    hasFolder: () => boolean;
    /** Persist `"manual"` at the given configuration target. */
    setManual: (target: ConfigurationTarget) => PromiseLike<void>;
    /** Record the opt-out (called only on a genuine auto->manual transition). */
    recordOptOut: (report: {
        scope: PythonSetupOptOutScope;
        source: PythonSetupOptOutSource;
    }) => void;
    /** Surface a write failure to the user. */
    showError: (message: string) => PromiseLike<unknown>;
    /** Confirm the new state to the user. */
    showInfo: (message: string) => PromiseLike<unknown>;
}

/**
 * Turn automated Python-environment setup off (set
 * `databricks.python.environmentSetup` to `manual`) so an existing interpreter
 * is used as-is. Writes to Workspace scope when a folder is open, else Global so
 * the write still lands.
 *
 * The opt-out is recorded only on a real `auto -> manual` transition: re-running
 * the command while already manual re-writes idempotently and reassures the user,
 * but does not inflate the opt-out count. Nothing is recorded when the write
 * fails — the user is told, and the setting is unchanged.
 */
export async function optOutOfAutomatedPythonSetup(
    source: PythonSetupOptOutSource,
    deps: ManualSetupOptOutDeps
): Promise<void> {
    const wasManual = deps.currentMode() === "manual";
    const hasFolder = deps.hasFolder();
    const target = hasFolder
        ? ConfigurationTarget.Workspace
        : ConfigurationTarget.Global;
    try {
        await deps.setManual(target);
    } catch (e) {
        // Don't claim success if the write failed — the user would otherwise
        // believe automated setup is off when it is not.
        await deps.showError(
            `Could not update databricks.python.environmentSetup: ${
                e instanceof Error ? e.message : String(e)
            }`
        );
        return;
    }
    if (!wasManual) {
        deps.recordOptOut({
            scope: hasFolder ? "workspace" : "global",
            source,
        });
    }
    // Match the message to the scope actually written: "this project" for
    // Workspace, "globally" for the no-folder Global fallback.
    const scope = hasFolder ? "for this project" : "globally";
    await deps.showInfo(
        `Automated Python environment setup is now off ${scope} ("databricks.python.environmentSetup": "manual"). Your existing interpreter will be used as-is.`
    );
}
