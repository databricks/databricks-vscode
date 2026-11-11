import { ConfigurationTarget } from "vscode";
import { errorMessage } from "../../../platform/errors";
import type { Logger } from "../../../platform/log";
import { setting, type Settings } from "../../../platform/settings";
import { stateKey, type StateStore } from "../../../platform/state";

/** Jupyter's cell markers for `.py` files in the Interactive Window (RUN-09). */
const CELL_MARKER_REGEX = setting<string | undefined>(
    "jupyter",
    "interactiveWindow.cellMarker.codeRegex",
    undefined,
);
const CELL_MARKER_DEFAULT = setting<string | undefined>(
    "jupyter",
    "interactiveWindow.cellMarker.default",
    undefined,
);

/** Off in User settings: the extension writes no cell markers, and leaves the ones it wrote. */
const CONFIGURE_CELL_MARKERS = setting<boolean>(
    "databricks",
    "notebooks.configureJupyterCellMarkers",
    true,
);

/** Set once the markers were written for this workspace, so they are written once. */
export const CELL_MARKERS_WRITTEN = stateKey<boolean>(
    "databricks.notebooks.cellMarkersWritten",
    "workspace",
    false,
);

const NOTEBOOK_SOURCE = "# Databricks notebook source";
const COMMAND = "# COMMAND ----------";

/**
 * The old `setDbnbCellLimits` rule: the Databricks markers prepended to the
 * current regex, each only if it isn't in it yet; both alone when Jupyter
 * has no regex.
 */
export function cellMarkerRegex(current: string | undefined): string {
    let regex = current ?? `^(${NOTEBOOK_SOURCE}|${COMMAND})`;
    for (const marker of [NOTEBOOK_SOURCE, COMMAND]) {
        if (!regex.includes(marker)) {
            regex = `^${marker}|${regex}`;
        }
    }
    return regex;
}

export interface CellMarkerDeps {
    /** Whether Jupyter is installed and enabled: its settings exist only then. */
    jupyterInstalled(): boolean;
    readonly settings: Settings;
    readonly state: StateStore;
    readonly log: Logger;
}

/**
 * Makes `# Databricks notebook source` and `# COMMAND ----------` Jupyter
 * cell markers, in the workspace settings, so Databricks `.py` notebooks
 * split into cells in the Interactive Window. The old extension rewrote
 * them on every activation in a project; now they are written once per
 * workspace, so a user who removes them keeps them removed, and a workspace
 * whose settings already have them isn't touched. Without Jupyter there is
 * nothing to write them to: they wait until it's installed. When the setting
 * is off, nothing is written and the markers already written are left alone.
 */
export async function writeCellMarkers(deps: CellMarkerDeps): Promise<void> {
    if (
        !deps.settings.get(CONFIGURE_CELL_MARKERS) ||
        deps.state.get(CELL_MARKERS_WRITTEN) ||
        !deps.jupyterInstalled()
    ) {
        return;
    }
    try {
        const current = deps.settings.get(CELL_MARKER_REGEX);
        const regex = cellMarkerRegex(current);
        if (regex !== current) {
            await deps.settings.update(CELL_MARKER_REGEX, regex, ConfigurationTarget.Workspace);
        }
        if (deps.settings.get(CELL_MARKER_DEFAULT) !== COMMAND) {
            await deps.settings.update(CELL_MARKER_DEFAULT, COMMAND, ConfigurationTarget.Workspace);
        }
        await deps.state.set(CELL_MARKERS_WRITTEN, true);
    } catch (e) {
        // The settings aren't registered (Jupyter is still starting, or failed to), and writing them fails; try again next time.
        deps.log.error(
            `Error while setting jupyter configs for parsing databricks notebooks: ${errorMessage(e)}`,
        );
    }
}
