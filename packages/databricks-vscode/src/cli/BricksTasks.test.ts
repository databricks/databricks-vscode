import * as assert from "assert";
import {instance, mock} from "ts-mockito";
import type {ConnectionManager} from "../configuration/ConnectionManager";
import {SyncState} from "../sync/CodeSynchronizer";
import {SyncTask} from "./BricksTasks";
import {CliWrapper} from "./CliWrapper";

describe(__filename, () => {
    let connection: ConnectionManager;
    let cli: CliWrapper;

    beforeEach(() => {
        connection = instance(mock<ConnectionManager>());
        cli = instance(mock(CliWrapper));
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
