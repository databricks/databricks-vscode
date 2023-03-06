import "@databricks/databricks-sdk";
import assert from "assert";
import {mock, instance, capture, reset} from "ts-mockito";
import {EventEmitter} from "vscode";
import {SyncState} from "../sync";
import {BricksSyncParser} from "./BricksSyncParser";

describe("tests for BricksSycnParser", () => {
    let syncState: SyncState = "STOPPED";
    let mockedOutput: EventEmitter<string>;
    let bricksSyncParser: BricksSyncParser;

    const syncStateCallback = (state: SyncState) => {
        syncState = state;
    };

    beforeEach(() => {
        syncState = "STOPPED";
        mockedOutput = mock(EventEmitter<string>);
        bricksSyncParser = new BricksSyncParser(
            syncStateCallback,
            instance(mockedOutput)
        );
    });

    it("ignores empty lines", () => {
        assert.equal(syncState, "STOPPED");
        bricksSyncParser.processStdout("\n\n");
        assert.equal(syncState, "STOPPED");
    });

    it("ignores non-JSON lines", () => {
        assert.equal(syncState, "STOPPED");
        bricksSyncParser.processStdout("foo\nbar\n");
        assert.equal(syncState, "STOPPED");
    });

    it("transitions from STOPPED -> IN_PROGRESS -> WATCHING_FOR_CHANGES", () => {
        assert.equal(syncState, "STOPPED");
        bricksSyncParser.processStdout(`{"type": "start"}`);
        assert.equal(syncState, "IN_PROGRESS");
        bricksSyncParser.processStdout(`{"type": "complete"}`);
        assert.equal(syncState, "WATCHING_FOR_CHANGES");
    });

    it("writes start events to the terminal", () => {
        bricksSyncParser.processStdout(
            `{"type": "start", "put": ["hello"], "delete": ["world"]}`
        );
        const arg = capture(mockedOutput.fire).first();
        assert.match(arg[0], /^Starting synchronization /);
    });

    it("writes progress events to the terminal", () => {
        bricksSyncParser.processStdout(
            `{"type": "progress", "action": "put", "path": "hello", "progress": 0.0}`
        );
        bricksSyncParser.processStdout(
            `{"type": "progress", "action": "put", "path": "hello", "progress": 1.0}`
        );
        assert.match(
            capture(mockedOutput.fire).first()[0],
            /^Uploaded hello\r\n/
        );
        reset(mockedOutput);

        bricksSyncParser.processStdout(
            `{"type": "progress", "action": "delete", "path": "hello", "progress": 0.0}`
        );
        bricksSyncParser.processStdout(
            `{"type": "progress", "action": "delete", "path": "hello", "progress": 1.0}`
        );
        assert.match(
            capture(mockedOutput.fire).first()[0],
            /^Deleted hello\r\n/
        );
        reset(mockedOutput);
    });

    it("writes complete events to the terminal", () => {
        bricksSyncParser.processStdout(
            `{"type": "complete", "put": ["hello"], "delete": ["world"]}`
        );
        const arg = capture(mockedOutput.fire).first();
        assert.match(arg[0], /^Completed synchronization\r\n/);
    });
});
