import "@databricks/databricks-sdk";
import assert from "assert";
import {mock, instance, capture, reset} from "ts-mockito";
import {EventEmitter} from "vscode";
import {SyncState} from "../sync";
import {DatabricksCliSyncParser} from "./DatabricksCliSyncParser";

describe("tests for SycnParser", () => {
    let syncState: SyncState = "STOPPED";
    let mockedOutput: EventEmitter<string>;
    let databricksSyncParser: DatabricksCliSyncParser;

    const syncStateCallback = (state: SyncState) => {
        syncState = state;
    };

    beforeEach(() => {
        syncState = "STOPPED";
        mockedOutput = mock(EventEmitter<string>);
        databricksSyncParser = new DatabricksCliSyncParser(
            syncStateCallback,
            instance(mockedOutput)
        );
    });

    it("ignores empty lines", () => {
        assert.equal(syncState, "STOPPED");
        databricksSyncParser.processStdout("\n\n");
        assert.equal(syncState, "STOPPED");
    });

    it("ignores non-JSON lines", () => {
        assert.equal(syncState, "STOPPED");
        databricksSyncParser.processStdout("foo\nbar\n");
        assert.equal(syncState, "STOPPED");
    });

    it("transitions from STOPPED -> IN_PROGRESS -> WATCHING_FOR_CHANGES", () => {
        assert.equal(syncState, "STOPPED");
        databricksSyncParser.processStdout(`{"type": "start"}`);
        assert.equal(syncState, "IN_PROGRESS");
        databricksSyncParser.processStdout(`{"type": "complete"}`);
        assert.equal(syncState, "WATCHING_FOR_CHANGES");
    });

    it("writes start events to the terminal", () => {
        databricksSyncParser.processStdout(
            `{"type": "start", "put": ["hello"], "delete": ["world"]}`
        );
        const arg = capture(mockedOutput.fire).first();
        assert.match(arg[0], /^Starting synchronization /);
    });

    it("writes progress events to the terminal", () => {
        databricksSyncParser.processStdout(
            `{"type": "progress", "action": "put", "path": "hello", "progress": 0.0}`
        );
        databricksSyncParser.processStdout(
            `{"type": "progress", "action": "put", "path": "hello", "progress": 1.0}`
        );
        assert.match(
            capture(mockedOutput.fire).first()[0],
            /^Uploaded hello\r\n/
        );
        reset(mockedOutput);

        databricksSyncParser.processStdout(
            `{"type": "progress", "action": "delete", "path": "hello", "progress": 0.0}`
        );
        databricksSyncParser.processStdout(
            `{"type": "progress", "action": "delete", "path": "hello", "progress": 1.0}`
        );
        assert.match(
            capture(mockedOutput.fire).first()[0],
            /^Deleted hello\r\n/
        );
        reset(mockedOutput);
    });

    it("writes complete events to the terminal", () => {
        databricksSyncParser.processStdout(
            `{"type": "complete", "put": ["hello"], "delete": ["world"]}`
        );
        const arg = capture(mockedOutput.fire).first();
        assert.match(arg[0], /^Completed synchronization\r\n/);
    });
});
