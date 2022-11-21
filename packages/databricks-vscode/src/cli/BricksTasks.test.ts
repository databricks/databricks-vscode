import "@databricks/databricks-sdk/dist";
import * as assert from "assert";
import {instance, mock} from "ts-mockito";
import type {ConnectionManager} from "../configuration/ConnectionManager";
import {SyncTask} from "./BricksTasks";
import type {CliWrapper} from "./CliWrapper";

describe(__filename, () => {
    let connection: ConnectionManager;
    let cli: CliWrapper;

    beforeEach(() => {
        connection = instance(mock<ConnectionManager>());
        cli = instance(mock<CliWrapper>());
    });

    it("should create a sync task", () => {
        const task = new SyncTask(connection, cli, "incremental", () => {});

        assert.equal(task.definition.type, "databricks");
        assert.equal(task.definition.task, "sync");
        assert.equal(task.isBackground, true);
        assert.deepEqual(task.problemMatchers, ["$bricks-sync"]);
    });
});
