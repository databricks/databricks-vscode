import * as assert from "assert";
import {instance, mock} from "ts-mockito";
import type {ConnectionManager} from "../configuration/ConnectionManager";
import {SyncState} from "../sync/CodeSynchronizer";
import {BricksTaskProvider, SyncTask} from "./BricksTasks";
import {CliWrapper} from "./CliWrapper";

describe(__filename, () => {
    let connection: ConnectionManager;
    let cli: CliWrapper;

    beforeEach(() => {
        connection = instance(mock<ConnectionManager>());
        cli = instance(mock(CliWrapper));
    });

    it("should create a task provider", () => {
        let provider = new BricksTaskProvider(connection, cli);
        let tasks = provider.provideTasks();

        assert.equal(tasks.length, 2);
        assert.equal(tasks[0].definition.type, "databricks");
        assert.equal(tasks[0].definition.task, "sync");
    });

    it("should create a sync task", () => {
        let task = new SyncTask(
            connection,
            cli,
            "incremental",
            (state: SyncState) => {}
        );

        assert.equal(task.definition.type, "databricks");
        assert.equal(task.definition.task, "sync");
        assert.equal(task.isBackground, true);
        assert.deepEqual(task.problemMatchers, ["$bricks-sync"]);
    });
});
