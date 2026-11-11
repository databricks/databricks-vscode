/**
 * Project IDs that other features refer to. The project feature registers
 * the target picker; the bundle-variables feature registers the variables'
 * command.
 */

/** "Select a bundle target"; also the "Change Target Mode" remedy of a run (RUN-01). */
export const SELECT_TARGET = "databricks.connection.bundle.selectTarget";

/**
 * Opens the active target's `vscode.bundlevars.json`, creating it first.
 * Also the "Assign Values" remedy for `MissingVariableError`.
 */
export const OPEN_VARIABLES_FILE = "databricks.bundle.variable.openFile";

/** The Project view, where the bundle's resources and variables are sections. */
export const PROJECT_VIEW = "configurationView";
