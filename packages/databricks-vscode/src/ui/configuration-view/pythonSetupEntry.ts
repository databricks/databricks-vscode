import {Event, ThemeColor, ThemeIcon} from "vscode";
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
    /** Fires when {@link ready} changes, so the view can refresh. */
    readonly onDidChangeState: Event<void>;
}

/**
 * Build the single Python Environment child row for the uv-native setup.
 *
 * Pure over its inputs so the label/icon/command wiring is unit-testable. Not
 * ready → a run call-to-action (rocket); ready → a done status line (check).
 * Either way the row runs `commandId`, so a ready environment can be re-run.
 * Returns a one-element array to slot directly into `getChildren`, underscoring
 * that this entry is mutually exclusive with the legacy checklist.
 */
export function buildPythonSetupEntry(
    state: {ready: boolean},
    commandId: string
): ConfigurationTreeItem[] {
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
