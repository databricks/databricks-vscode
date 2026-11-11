import { describe, expect, it } from "vitest";
import { Settings } from "../../../platform/settings";
import { StateStore } from "../../../platform/state";
import { fakeLog, fakeMemento, fakeSettings } from "../../../test-support/fakes";
import { CELL_MARKERS_WRITTEN, cellMarkerRegex, writeCellMarkers } from "./cellMarkers";

const JUPYTER_DEFAULT = String.raw`^(#\s*%%|#\s*\<codecell\>|#\s*In\[\d*?\]|#\s*In\[ \])`;
const REGEX = "jupyter.interactiveWindow.cellMarker.codeRegex";
const DEFAULT = "jupyter.interactiveWindow.cellMarker.default";
const CONFIGURE = "databricks.notebooks.configureJupyterCellMarkers";

describe("cellMarkerRegex", () => {
    it("is both markers when Jupyter has no regex", () => {
        expect(cellMarkerRegex(undefined)).toBe(
            "^(# Databricks notebook source|# COMMAND ----------)",
        );
    });

    it("prepends the markers missing from Jupyter's regex, as before", () => {
        expect(cellMarkerRegex(JUPYTER_DEFAULT)).toBe(
            `^# COMMAND ----------|^# Databricks notebook source|${JUPYTER_DEFAULT}`,
        );
        expect(cellMarkerRegex(`^# Databricks notebook source|${JUPYTER_DEFAULT}`)).toBe(
            `^# COMMAND ----------|^# Databricks notebook source|${JUPYTER_DEFAULT}`,
        );
    });

    it("leaves a regex that has both", () => {
        const regex = cellMarkerRegex(JUPYTER_DEFAULT);
        expect(cellMarkerRegex(regex)).toBe(regex);
    });
});

describe("writeCellMarkers", () => {
    function setup(values: Record<string, unknown> = {}, jupyter = true) {
        const state = new StateStore({ global: fakeMemento(), workspace: fakeMemento() });
        const log = fakeLog();
        return {
            values,
            state,
            log,
            deps: { settings: fakeSettings(values), state, log, jupyterInstalled: () => jupyter },
        };
    }

    it("writes the regex and the default once per workspace", async () => {
        const { values, state, deps } = setup({ [REGEX]: JUPYTER_DEFAULT, [DEFAULT]: "# %%" });
        await writeCellMarkers(deps);
        expect(values[REGEX]).toBe(cellMarkerRegex(JUPYTER_DEFAULT));
        expect(values[DEFAULT]).toBe("# COMMAND ----------");
        expect(state.get(CELL_MARKERS_WRITTEN)).toBe(true);

        values[REGEX] = JUPYTER_DEFAULT;
        await writeCellMarkers(deps);
        expect(values[REGEX]).toBe(JUPYTER_DEFAULT);
    });

    it("writes nothing when configureJupyterCellMarkers is off, and writes once it is turned on", async () => {
        const { values, state, deps } = setup({
            [CONFIGURE]: false,
            [REGEX]: JUPYTER_DEFAULT,
            [DEFAULT]: "# %%",
        });
        await writeCellMarkers(deps);
        expect(values[REGEX]).toBe(JUPYTER_DEFAULT);
        expect(values[DEFAULT]).toBe("# %%");
        expect(state.get(CELL_MARKERS_WRITTEN)).toBe(false);

        values[CONFIGURE] = true;
        await writeCellMarkers(deps);
        expect(values[REGEX]).toBe(cellMarkerRegex(JUPYTER_DEFAULT));
        expect(values[DEFAULT]).toBe("# COMMAND ----------");
        expect(state.get(CELL_MARKERS_WRITTEN)).toBe(true);
    });

    it("writes the markers when configureJupyterCellMarkers is unset", async () => {
        const { values, state, deps } = setup({ [REGEX]: JUPYTER_DEFAULT });
        await writeCellMarkers(deps);
        expect(values[REGEX]).toBe(cellMarkerRegex(JUPYTER_DEFAULT));
        expect(values[DEFAULT]).toBe("# COMMAND ----------");
        expect(state.get(CELL_MARKERS_WRITTEN)).toBe(true);
    });

    it("writes the markers when configureJupyterCellMarkers is on", async () => {
        const { values, state, deps } = setup({ [CONFIGURE]: true, [REGEX]: JUPYTER_DEFAULT });
        await writeCellMarkers(deps);
        expect(values[REGEX]).toBe(cellMarkerRegex(JUPYTER_DEFAULT));
        expect(values[DEFAULT]).toBe("# COMMAND ----------");
        expect(state.get(CELL_MARKERS_WRITTEN)).toBe(true);
    });

    it("tries again next time when the settings can't be written", async () => {
        const { state, deps } = setup();
        const settings = new Settings({
            getConfiguration: () => ({
                get: () => undefined,
                inspect: () => undefined,
                update: () => Promise.reject(new Error("not registered")),
            }),
            onDidChangeConfiguration: () => ({ dispose: () => {} }),
        });
        await writeCellMarkers({ ...deps, settings });
        expect(state.get(CELL_MARKERS_WRITTEN)).toBe(false);
    });

    it("waits for Jupyter, whose settings they are, and logs nothing meanwhile", async () => {
        const { values, state, log, deps } = setup({}, false);
        await writeCellMarkers(deps);
        expect(values).toEqual({});
        expect(state.get(CELL_MARKERS_WRITTEN)).toBe(false);
        expect(log.entries).toEqual([]);

        await writeCellMarkers({ ...deps, jupyterInstalled: () => true });
        expect(state.get(CELL_MARKERS_WRITTEN)).toBe(true);
    });
});
