import {Disposable, Event, EventEmitter, ThemeColor, ThemeIcon} from "vscode";
import type {PythonSetupDriftState} from "../../python-setup/controllers/PythonSetupDriftManager";
import {ConfigurationTreeItem} from "./types";

const PYTHON_SETUP_ENTRY_ID = "ENVIRONMENT_PYTHON_SETUP";
// Distinct tree-item id: VS Code doesn't reliably rebind a node's `command` when
// the id stays the same but the command changes across a refresh. The drifted
// row points at a different command (rerunPythonEnv) than the ready/set-up row
// (setupPythonEnv), so it must be a separate node or the re-run click is inert.
const PYTHON_SETUP_DRIFTED_ENTRY_ID = "ENVIRONMENT_PYTHON_SETUP_DRIFTED";

/**
 * The slice of the setup orchestrator the config view needs, as a narrow
 * interface so {@link EnvironmentComponent} carries no dependency on the
 * controller/gateway layers and the entry builder stays unit-testable.
 */
export interface PythonSetupEntry {
    /** Whether the uv-native entry should be shown instead of the checklist. */
    isVisible(): Promise<boolean>;
    /** True once a setup has completed successfully this session. */
    readonly ready: boolean;
    /**
     * Persisted setup/drift state (see {@link PythonSetupDriftState}). Survives a
     * window reload, so the row does not revert to the initial CTA across sessions.
     */
    readonly driftState: PythonSetupDriftState;
    /** Fires when readiness or drift state changes, so the view refreshes. */
    readonly onDidChangeState: Event<void>;
}

/**
 * Build the single Python Environment child row for the uv-native setup, in
 * precedence order: drifted -> an out-of-sync warning that re-runs setup;
 * done -> a check that can still be re-run; neither -> a run CTA (rocket).
 * "Done" is the session `ready` flag OR a persisted `driftState` of `ready`.
 */
export function buildPythonSetupEntry(
    state: {ready: boolean; driftState: PythonSetupDriftState},
    commandId: string,
    rerunCommandId: string
): ConfigurationTreeItem[] {
    if (state.driftState === "drifted") {
        return [
            {
                id: PYTHON_SETUP_DRIFTED_ENTRY_ID,
                label: "Python environment is out of sync",
                tooltip:
                    "The selected compute no longer matches your Python " +
                    "environment. Re-run setup to align it.",
                contextValue: "databricks.environment.pythonSetup.drifted",
                iconPath: new ThemeIcon(
                    "warning",
                    new ThemeColor("errorForeground")
                ),
                command: {
                    title: "Re-run Python setup",
                    command: rerunCommandId,
                },
            },
        ];
    }
    const done = state.ready || state.driftState === "ready";
    return [
        {
            id: PYTHON_SETUP_ENTRY_ID,
            label: done
                ? "Python environment ready"
                : "Set up Python environment",
            contextValue: `databricks.environment.pythonSetup.${
                done ? "success" : "error"
            }`,
            iconPath: done
                ? new ThemeIcon("check")
                : new ThemeIcon("rocket", new ThemeColor("errorForeground")),
            command: {
                title: "Set up Python environment",
                command: commandId,
            },
        },
    ];
}

/**
 * Combine the setup controller's session `ready` flag with the drift manager's
 * `state` into the single {@link PythonSetupEntry} the config view consumes,
 * merging both change events. The returned Disposable tears down the emitter
 * and its subscriptions.
 */
export function composePythonSetupEntry(
    setup: {
        isVisible(): Promise<boolean>;
        readonly ready: boolean;
        readonly onDidChangeState: Event<void>;
    },
    drift: {
        readonly state: PythonSetupDriftState;
        readonly onDidChangeState: Event<void>;
    }
): PythonSetupEntry & Disposable {
    const emitter = new EventEmitter<void>();
    const subs = [
        setup.onDidChangeState(() => emitter.fire()),
        drift.onDidChangeState(() => emitter.fire()),
    ];
    return {
        isVisible: () => setup.isVisible(),
        get ready() {
            return setup.ready;
        },
        get driftState() {
            return drift.state;
        },
        onDidChangeState: emitter.event,
        dispose() {
            subs.forEach((s) => s.dispose());
            emitter.dispose();
        },
    };
}
