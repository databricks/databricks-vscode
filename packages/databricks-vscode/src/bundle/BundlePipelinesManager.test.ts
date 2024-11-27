import {BundlePipelinesManager} from "./BundlePipelinesManager";
import {BundleRunStatusManager} from "./run/BundleRunStatusManager";
import {ConfigModel} from "../configuration/models/ConfigModel";
import {mock, instance, when} from "ts-mockito";
import assert from "assert";
import {EventEmitter, Uri} from "vscode";
import {install, InstalledClock} from "@sinonjs/fake-timers";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {locationToRange} from "./BundlePipelinesManager";
import path from "node:path";
import os from "os";
import fs from "fs/promises";

describe("BundlePipelinesManager", () => {
    let connectionManager: ConnectionManager;
    let runStatusManager: BundleRunStatusManager;
    let configModel: ConfigModel;
    let manager: BundlePipelinesManager;
    let eventEmitter: EventEmitter<void>;
    let clock: InstalledClock;

    beforeEach(() => {
        clock = install();
        eventEmitter = new EventEmitter();
        runStatusManager = mock<BundleRunStatusManager>();
        configModel = mock<ConfigModel>();
        connectionManager = mock<ConnectionManager>();
        when(runStatusManager.onDidChange).thenReturn(eventEmitter.event);
        when(configModel.onDidChangeKey("remoteStateConfig")).thenReturn(
            new EventEmitter<void>().event
        );
        when(configModel.onDidChangeTarget).thenReturn(
            new EventEmitter<void>().event
        );
        manager = new BundlePipelinesManager(
            instance(connectionManager),
            instance(runStatusManager),
            instance(configModel)
        );
    });

    afterEach(() => {
        clock.uninstall();
    });

    it("should update pipeline datasets from run events", async () => {
        let datasets;
        const remoteState = {resources: {pipelines: {pipeline1: {}}}};
        when(configModel.get("remoteStateConfig")).thenResolve(remoteState);
        const runStatuses = new Map();
        when(runStatusManager.runStatuses).thenReturn(runStatuses);

        /* eslint-disable @typescript-eslint/naming-convention */
        const firstRun = {
            data: {creation_time: 10},
            events: [
                {
                    origin: {dataset_name: "table1"},
                    details: {dataset_definition: {dataset_type: "TABLE"}},
                },
                {
                    origin: {not_a_dataset_name: "table1.5"},
                },
                {
                    origin: {dataset_name: "table2"},
                    details: {dataset_definition: {dataset_type: "TABLE"}},
                },
                {
                    origin: {dataset_name: "table2.5"},
                    details: {dataset_definition: {dataset_type: "VIEW"}},
                },
            ],
        };
        /* eslint-enable @typescript-eslint/naming-convention */
        runStatuses.set("pipelines.pipeline1", firstRun);

        eventEmitter.fire();
        await clock.runToLastAsync();

        datasets = manager.getDatasets("pipeline1");
        assert.strictEqual(datasets.size, 2);
        assert(datasets.has("table1"));
        assert(datasets.has("table2"));

        /* eslint-disable @typescript-eslint/naming-convention */
        const secondPartialRun = {
            data: {
                creation_time: 100,
                refresh_selection: ["table3", "table4"],
            },
            events: [
                {
                    origin: {dataset_name: "table3"},
                    details: {dataset_definition: {dataset_type: "TABLE"}},
                },
                {
                    origin: {not_a_dataset_name: "table3.5"},
                },
                {
                    origin: {dataset_name: "table4"},
                    details: {dataset_definition: {dataset_type: "TABLE"}},
                },
            ],
        };
        /* eslint-enable @typescript-eslint/naming-convention */

        runStatuses.set("pipelines.pipeline1", secondPartialRun);
        eventEmitter.fire();
        await clock.runToLastAsync();

        datasets = manager.getDatasets("pipeline1");
        assert.strictEqual(datasets.size, 4);
        assert(datasets.has("table1"));
        assert(datasets.has("table2"));
        assert(datasets.has("table3"));
        assert(datasets.has("table4"));

        /* eslint-disable @typescript-eslint/naming-convention */
        const uncompletedFullRefreshRun = {
            data: {
                creation_time: 200,
                refresh_selection: [],
                state: "RUNNING",
            },
            events: [
                {
                    origin: {dataset_name: "table_new"},
                    details: {dataset_definition: {dataset_type: "TABLE"}},
                },
                {
                    origin: {not_a_dataset_name: "not a table"},
                },
                {
                    origin: {dataset_name: "table_final"},
                    details: {dataset_definition: {dataset_type: "TABLE"}},
                },
            ],
        };
        /* eslint-enable @typescript-eslint/naming-convention */
        runStatuses.set("pipelines.pipeline1", uncompletedFullRefreshRun);
        eventEmitter.fire();
        await clock.runToLastAsync();

        datasets = manager.getDatasets("pipeline1");
        assert.strictEqual(datasets.size, 6);
        assert(datasets.has("table_new"));
        assert(datasets.has("table_final"));

        /* eslint-disable @typescript-eslint/naming-convention */
        const finalFullRefreshRun = {
            data: {
                creation_time: 300,
                refresh_selection: [],
                state: "COMPLETED",
            },
            events: [
                {
                    origin: {dataset_name: "table_new"},
                    details: {dataset_definition: {dataset_type: "TABLE"}},
                },
                {
                    origin: {not_a_dataset_name: "not a table"},
                },
                {
                    origin: {dataset_name: "table_final"},
                    details: {dataset_definition: {dataset_type: "TABLE"}},
                },
            ],
        };
        /* eslint-enable @typescript-eslint/naming-convention */
        runStatuses.set("pipelines.pipeline1", finalFullRefreshRun);
        eventEmitter.fire();
        await clock.runToLastAsync();

        // Only the datasets from the final full-refresh run should be left
        datasets = manager.getDatasets("pipelines.pipeline1");
        assert.strictEqual(datasets.size, 2);
        assert(datasets.has("table_new"));
        assert(datasets.has("table_final"));
    });

    it("should update pipeline shemas from run events", async () => {
        const remoteState = {resources: {pipelines: {pipeline1: {}}}};
        when(configModel.get("remoteStateConfig")).thenResolve(remoteState);
        const runStatuses = new Map();
        when(runStatusManager.runStatuses).thenReturn(runStatuses);

        /* eslint-disable @typescript-eslint/naming-convention */
        const firstRun = {
            data: {creation_time: 10},
            events: [
                {
                    origin: {dataset_name: "table1"},
                    details: {
                        dataset_definition: {
                            dataset_type: "TABLE",
                            schema: [
                                {name: "col1", data_type: "STRING"},
                                {name: "col2", not_a_data_type: "INTEGER"},
                            ],
                        },
                    },
                },
                {
                    origin: {not_a_dataset_name: "table1.5"},
                },
                {
                    origin: {dataset_name: "table2"},
                    details: {
                        dataset_definition: {dataset_type: "TABLE", schema: []},
                    },
                },
                {
                    origin: {dataset_name: "table3"},
                    details: {
                        dataset_definition: {
                            dataset_type: "VIEW",
                            schema: [{name: "col1", data_type: "STRING"}],
                        },
                    },
                },
            ],
        };
        /* eslint-enable @typescript-eslint/naming-convention */
        runStatuses.set("pipelines.pipeline1", firstRun);

        eventEmitter.fire();
        await clock.runToLastAsync();

        const schemas = manager.getSchemas("pipelines.pipeline1");
        assert.strictEqual(schemas.size, 2);
        assert.deepStrictEqual(schemas.get("table1"), {
            name: "table1",
            type: "TABLE",
            schema: [
                {name: "col1", type: "STRING"},
                {name: "col2", type: ""},
            ],
        });
        assert.deepStrictEqual(schemas.get("table3"), {
            name: "table3",
            type: "VIEW",
            schema: [{name: "col1", type: "STRING"}],
        });
    });

    describe("locationToRange", () => {
        it("should return correct range for a given location in a text file", async () => {
            const uri = Uri.file("/path/to/file.py");
            // eslint-disable-next-line @typescript-eslint/naming-convention
            const location = {path: "/path/to/file.py", line_number: 10};
            const range = await locationToRange(uri, location);
            assert.strictEqual(range.start.line, 9);
            assert.strictEqual(range.end.line, 9);
        });

        it("should return correct range for a given location in a notebook file", async () => {
            const uri = Uri.file("/path/to/notebook.ipynb");
            const location = {
                path: "/path/to/notebook.ipynb",
                // eslint-disable-next-line @typescript-eslint/naming-convention
                line_number: 5,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                notebook_cell_number: 2,
            };
            const range = await locationToRange(uri, location, "IPYNB");
            assert.strictEqual(range.start.line, 4);
            assert.strictEqual(range.end.line, 4);
        });

        it("should handle PY_DBNB file type correctly", async () => {
            // const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-"));
            const filePath = path.join(os.tmpdir(), "notebook.py");
            const uri = Uri.file(filePath);
            const fileContent = `# Databricks notebook source
print('cell 1')

# COMMAND ----------
print('cell 2')
print('still cell 2')


# COMMAND ----------
print('cell 3')`;

            await fs.writeFile(filePath, fileContent);

            const location = {
                path: filePath,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                line_number: 1,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                notebook_cell_number: 3,
            };

            const range = await locationToRange(uri, location, "PY_DBNB");
            assert.strictEqual(range.start.line, 9);
            assert.strictEqual(range.end.line, 9);
        });
    });
});
