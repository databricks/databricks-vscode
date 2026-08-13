import {Disposable, Event, EventEmitter, ThemeColor, ThemeIcon} from "vscode";
import {ConfigurationTreeItem} from "./types";

const PYTHON_SETUP_ENTRY_ID = "ENVIRONMENT_PYTHON_SETUP";

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
     * True when the selected compute no longer matches the recorded setup state
     * (see {@link PythonSetupDriftManager}); renders the "out of date" state.
     */
    readonly drifted: boolean;
    /** Fires when {@link ready} or {@link drifted} changes, so the view refreshes. */
    readonly onDidChangeState: Event<void>;
}

/**
 * Build the single Python Environment child row for the uv-native setup.
 *
 * Three states, in precedence order:
 *   - drifted  -> an "out of date" warning that re-runs setup (rerunCommandId);
 *   - ready    -> a done status line (check) that can still be re-run;
 *   - neither  -> a run call-to-action (rocket).
 * Drift wins over ready: a stale environment is the more urgent thing to show,
 * and its action (re-run) is what resolves it.
 */
export function buildPythonSetupEntry(
    state: {ready: boolean; drifted: boolean},
    commandId: string,
    rerunCommandId: string
): ConfigurationTreeItem[] {
    if (state.drifted) {
        return [
            {
                id: PYTHON_SETUP_ENTRY_ID,
                label: "Python environment out of date",
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
    return [
        {
            id: PYTHON_SETUP_ENTRY_ID,
            label: state.ready
                ? "Python environment ready"
                : "Set up Python environment",
            contextValue: `databricks.environment.pythonSetup.${
                state.ready ? "success" : "error"
            }`,
            iconPath: state.ready
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
 * Combine the setup controller's `ready` state and the drift manager's
 * `drifted` state into the single {@link PythonSetupEntry} the config view
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
        readonly drifted: boolean;
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
        get drifted() {
            return drift.drifted;
        },
        onDidChangeState: emitter.event,
        dispose() {
            subs.forEach((s) => s.dispose());
            emitter.dispose();
        },
    };
}
