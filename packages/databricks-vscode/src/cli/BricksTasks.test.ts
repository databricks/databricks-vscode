import {ApiClient, Repo} from "@databricks/databricks-sdk";
import * as assert from "assert";
import {anything, instance, mock, when, verify} from "ts-mockito";
import {ProcessExecution, Uri, EventEmitter} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {SyncState} from "../sync/CodeSynchronizer";
import {BricksTaskProvider, SyncTask, BricksSyncParser} from "./BricksTasks";
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

describe("tests for BricksSycnParser", () => {
    let syncState: SyncState = "STOPPED";
    let bricksSycnParser: BricksSyncParser;

    const syncStateCallback = (state: SyncState) => {
        syncState = state;
    };

    beforeEach(() => {
        syncState = "STOPPED";
        bricksSycnParser = new BricksSyncParser(
            syncStateCallback,
            mock(EventEmitter<string>)
        );
    });

    it("processing empty logs transitions sync status from STOPPED -> IN_PROGRESS and we wait for initial sync complete", () => {
        assert.equal(syncState, "STOPPED");
        bricksSycnParser.process("");
        assert.equal(syncState, "IN_PROGRESS");
        bricksSycnParser.process("[INFO] Initial Sync Complete");
        assert.equal(syncState, "WATCHING_FOR_CHANGES");
    });

    it("processing action log transitions sync status from STOPPED -> INPROGRESS", () => {
        assert.equal(syncState, "STOPPED");
        bricksSycnParser.process("Action: PUT: hello.txt");
        assert.equal(syncState, "IN_PROGRESS");
    });

    it("test bricksSycnParser.process correctly keeps track of state of inflight requests", () => {
        // recieving some random logs from bricks sync
        assert.equal(syncState, "STOPPED");
        bricksSycnParser.process("some random logs");
        assert.equal(syncState, "IN_PROGRESS");

        // upload  hello.txt
        bricksSycnParser.process("Action: PUT: hello.txt");
        assert.equal(syncState, "IN_PROGRESS");
        bricksSycnParser.process("Uploaded hello.txt");
        assert.equal(syncState, "IN_PROGRESS");
        bricksSycnParser.process("[INFO] Initial Sync Complete");
        assert.equal(syncState, "WATCHING_FOR_CHANGES");

        // delete  bye.txt
        bricksSycnParser.process("Action: DELETE: bye.txt");
        assert.equal(syncState, "IN_PROGRESS");
        bricksSycnParser.process("Deleted bye.txt");
        assert.equal(syncState, "WATCHING_FOR_CHANGES");

        // both upload and delete some random prefix string that should be ignored
        bricksSycnParser.process(
            "[INFO] foo bar Action: PUT: a.txt DELETE: b.txt"
        );
        bricksSycnParser.process("Uploaded a.txt");
        assert.equal(syncState, "IN_PROGRESS");
        bricksSycnParser.process("Deleted b.txt");
        assert.equal(syncState, "WATCHING_FOR_CHANGES");

        // upload and delete multiple files
        bricksSycnParser.process(
            "Action: PUT: a.txt, c.txt DELETE: b.txt, d.txt"
        );
        bricksSycnParser.process("Uploaded a.txt");
        assert.equal(syncState, "IN_PROGRESS");
        bricksSycnParser.process("Deleted b.txt");
        assert.equal(syncState, "IN_PROGRESS");
        bricksSycnParser.process("Deleted d.txt");
        assert.equal(syncState, "IN_PROGRESS");
        bricksSycnParser.process("Uploaded c.txt");
        assert.equal(syncState, "WATCHING_FOR_CHANGES");

        // multi line logs
        bricksSycnParser.process(
            "Action: PUT: a.txt, c.txt DELETE: b.txt, d.txt\n" +
                "Uploaded a.txt\n" +
                "some random text\n" +
                "Uploaded c.txt"
        );
        bricksSycnParser.process("Deleted b.txt");
        assert.equal(syncState, "IN_PROGRESS");
        bricksSycnParser.process("Deleted d.txt");
        assert.equal(syncState, "WATCHING_FOR_CHANGES");
    });

    it("uploaded logs for untracked files throw errors", () => {
        assert.throws(
            () => {
                bricksSycnParser.process("Uploaded a.txt");
            },
            {
                message: /untracked file uploaded/,
            }
        );
    });

    it("delete logs for untracked files throw errors", () => {
        assert.throws(
            () => {
                bricksSycnParser.process("Deleted a.txt");
            },
            {
                message: /untracked file deleted/,
            }
        );
    });
});
