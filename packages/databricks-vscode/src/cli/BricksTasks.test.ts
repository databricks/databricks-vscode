import * as assert from "assert";
import {anything, instance, mock, when, verify} from "ts-mockito";
import {ProcessExecution, Uri, workspace} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {SyncDestination} from "../configuration/SyncDestination";
import {BricksTaskProvider, SyncTask} from "./BricksTasks";
import {CliWrapper} from "./CliWrapper";

describe(__filename, () => {
    let connection: ConnectionManager;
    let cli: CliWrapper;

    beforeEach(() => {
        connection = instance(mock(ConnectionManager));
        cli = instance(mock(CliWrapper));
    });

    it("should create a task provider", () => {
        let provider = new BricksTaskProvider(connection, cli);
        let tasks = provider.provideTasks();

        assert.equal(tasks.length, 1);
        assert.equal(tasks[0].definition.type, "databricks");
        assert.equal(tasks[0].definition.task, "sync");
    });

    it("should create a sync task", () => {
        let task = new SyncTask(connection, cli, "incremental");

        assert.equal(task.definition.type, "databricks");
        assert.equal(task.definition.task, "sync");
        assert.equal(task.isBackground, true);
        assert.deepEqual(task.problemMatchers, ["$bricks-sync"]);
    });

    it("should lazily create a process execution", () => {
        let connectionMock = mock(ConnectionManager);
        when(connectionMock.profile).thenReturn("DEFAULT");
        when(connectionMock.me).thenReturn("fabian.jakobs@databricks.com");
        when(connectionMock.syncDestination).thenReturn(
            new SyncDestination(
                Uri.from({
                    scheme: "dbws",
                    path: "/Workspace/notebook-best-practices",
                }),
                Uri.file("/Desktop/notebook-best-practices")
            )
        );

        let cliMock = mock(CliWrapper);
        when(cliMock.getSyncCommand(anything())).thenReturn({
            command: "bricks",
            args: ["sync"],
        });

        let task = new SyncTask(
            instance(connectionMock),
            instance(cliMock),
            "incremental"
        );
        assert.ok(task.execution);

        let execution = task.execution as ProcessExecution;

        const syncCommandMock = cliMock.getSyncCommand(anything());

        verify(syncCommandMock).never();
        assert.equal(execution.process, "bricks");
        verify(syncCommandMock).once();
        assert.deepEqual(execution.args, ["sync"]);
        verify(syncCommandMock).once();
    });
});
