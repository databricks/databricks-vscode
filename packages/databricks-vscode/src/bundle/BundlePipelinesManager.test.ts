import {BundlePipelinesManager} from "./BundlePipelinesManager";
import {BundleRunStatusManager} from "./run/BundleRunStatusManager";
import {ConfigModel} from "../configuration/models/ConfigModel";
import {mock, instance, when} from "ts-mockito";
import assert from "assert";
import {EventEmitter} from "vscode";
import {install, InstalledClock} from "@sinonjs/fake-timers";

describe(__filename, () => {
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
        when(runStatusManager.onDidChange).thenReturn(eventEmitter.event);
        when(configModel.onDidChangeKey("remoteStateConfig")).thenReturn(
            new EventEmitter<void>().event
        );
        when(configModel.onDidChangeTarget).thenReturn(
            new EventEmitter<void>().event
        );
        manager = new BundlePipelinesManager(
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

        const firstRun = {
            data: {
                update: {creation_time: 10},
            },
            events: [
                {origin: {dataset_name: "table1"}},
                {origin: {not_a_dataset_name: "table1.5"}},
                {origin: {dataset_name: "table2"}},
            ],
        };
        runStatuses.set("pipelines.pipeline1", firstRun);

        eventEmitter.fire();
        await clock.runToLastAsync();

        datasets = manager.getDatasets("pipeline1");
        assert.strictEqual(datasets.size, 2);
        assert(datasets.has("table1"));
        assert(datasets.has("table2"));

        const secondPartialRun = {
            data: {
                update: {
                    creation_time: 100,
                    refresh_selection: ["table3", "table4"],
                },
            },
            events: [
                {origin: {dataset_name: "table3"}},
                {origin: {not_a_dataset_name: "table3.5"}},
                {origin: {dataset_name: "table4"}},
            ],
        };

        runStatuses.set("pipelines.pipeline1", secondPartialRun);
        eventEmitter.fire();
        await clock.runToLastAsync();

        datasets = manager.getDatasets("pipeline1");
        assert.strictEqual(datasets.size, 4);
        assert(datasets.has("table1"));
        assert(datasets.has("table2"));
        assert(datasets.has("table3"));
        assert(datasets.has("table4"));

        const finalFullRefreshRun = {
            data: {
                update: {
                    creation_time: 200,
                    refresh_selection: [],
                },
            },
            events: [
                {origin: {dataset_name: "table_new"}},
                {origin: {not_a_dataset_name: "not a table"}},
                {origin: {dataset_name: "table_final"}},
            ],
        };
        runStatuses.set("pipelines.pipeline1", finalFullRefreshRun);
        eventEmitter.fire();
        await clock.runToLastAsync();

        // Only the datasets from the final full-refresh run should be left
        datasets = manager.getDatasets("pipeline1");
        assert.strictEqual(datasets.size, 2);
        assert(datasets.has("table_new"));
        assert(datasets.has("table_final"));
    });
});
