import {Disposable, Event, EventEmitter, ThemeColor, ThemeIcon} from "vscode";
import type {PythonSetupDriftState} from "../../python-setup/controllers/PythonSetupDriftManager";
import {ConfigurationTreeItem} from "./types";

const PYTHON_SETUP_ENTRY_ID = "ENVIRONMENT_PYTHON_SETUP";
// The drifted row deliberately uses a DISTINCT tree-item id from the ready/set-up
// row. VS Code does not reliably rebind a tree node's `command` when an item
// keeps the same `id` but swaps to a different command across a refresh: the
// label/icon update but clicks still fire (or fail to fire) the old binding. The
// ready and set-up states share one command (setupPythonEnv), but the drifted
// state points at a different command (rerunPythonEnv, for its own telemetry), so
// it must be a separate node — otherwise the "re-run" click is silently inert.
const PYTHON_SETUP_DRIFTED_ENTRY_ID = "ENVIRONMENT_PYTHON_SETUP_DRIFTED";

/**
 * The slice of the setup orchestrator the config view needs to render its
 * entry. Kept as a narrow interface (not the concrete
 * `PythonSetupEnvironmentSetup`) so {@link EnvironmentComponent} carries no
 * dependency on the controller/gateway layers and the entry builder stays
 * unit-testable.
 */
export interface PythonSetupEntry {
    /** Whether the uv-native entry should be shown instead of the checklist. */
    isVisible(): Promise<boolean>;
    /** True once a setup has completed successfully this session. */
    readonly ready: boolean;
    /**
     * The persisted setup/drift state (see {@link PythonSetupDriftState}): a
     * single signal derived from the recorded setup vs. the selected compute. It
     * survives a window reload — `ready`/`drifted` mean a prior setup is on
     * record — so the row does not revert to the initial CTA across sessions.
     */
    readonly driftState: PythonSetupDriftState;
    /** Fires when readiness or drift state changes, so the view refreshes. */
    readonly onDidChangeState: Event<void>;
}

/**
 * Build the single Python Environment child row for the uv-native setup.
 *
 * Three states, in precedence order:
 *   - drifted      -> an "out of date" warning that re-runs setup (rerunCommandId);
 *   - done         -> a done status line (check) that can still be re-run;
 *   - neither      -> a run call-to-action (rocket).
 * Drift wins: a stale environment is the more urgent thing to show, and its
 * action (re-run) is what resolves it. "Done" is the session `ready` flag OR a
 * persisted `driftState` of `ready` (a prior setup on record that still matches),
 * so the row stays "ready" across a window reload rather than reverting to the CTA.
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
                label: "Python environment is drifted",
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
 * derived `state` into the single {@link PythonSetupEntry} the config view
 * consumes, merging both change events so a change in either refreshes the row.
 * Returns a Disposable that tears down the merged emitter and its subscriptions.
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
