import { describe, expect, it } from "vitest";
import { Log } from "../../../platform/log";
import { nodeProcessRunner } from "../../../platform/process";
import { FakeProcessRunner } from "../../../test-support/fakeCli";
import { Cli } from "../Cli";
import { bundleSync, parseSyncError, parseSyncEvent, syncArgs } from "./bundleSync";

describe("bundle sync", () => {
    it("watches with JSON output, for the target", () => {
        expect(syncArgs("dev")).toEqual([
            "bundle",
            "sync",
            "--target",
            "dev",
            "--watch",
            "--output",
            "json",
        ]);
        expect(syncArgs("dev", { full: true })).toEqual([
            "bundle",
            "sync",
            "--target",
            "dev",
            "--watch",
            "--output",
            "json",
            "--full",
        ]);
    });

    it("starts a long-running CLI process in the bundle's root, with its environment", () => {
        const runner = new FakeProcessRunner();
        const cli = new Cli(runner, () => "/ext/bin/databricks", new Log([], "Test"));
        const lines: string[] = [];
        bundleSync(
            cli,
            "dev",
            { cwd: "/p", env: { A: "1" }, onStdoutLine: (l) => lines.push(l) },
            { full: true },
        );
        const [process] = runner.started;
        expect(process).toMatchObject({
            command: "/ext/bin/databricks",
            args: syncArgs("dev", { full: true }),
        });
        expect(process!.options).toMatchObject({ cwd: "/p", env: { A: "1" }, closeStdin: true });
        process!.stdout('{"type":"start"}');
        expect(lines).toEqual(['{"type":"start"}']);
    });

    describe("events", () => {
        // The old `SyncParser.test.ts` cases, and the CLI's event shapes.
        it("ignores empty, non-JSON and unknown lines", () => {
            expect(parseSyncEvent("")).toBeUndefined();
            expect(parseSyncEvent("  ")).toBeUndefined();
            expect(parseSyncEvent("foo")).toBeUndefined();
            expect(parseSyncEvent('{"type": "other"}')).toBeUndefined();
            expect(parseSyncEvent('{"type": "progress"}')).toBeUndefined();
        });

        it("parses start, progress and complete", () => {
            expect(
                parseSyncEvent(
                    '{"timestamp":"2026-10-03T12:00:00Z","seq":0,"type":"start","put":["hello"],"delete":["world"]}',
                ),
            ).toMatchObject({
                type: "start",
                put: ["hello"],
                delete: ["world"],
            });
            expect(
                parseSyncEvent('{"type":"progress","action":"put","path":"hello","progress":1}'),
            ).toMatchObject({
                type: "progress",
                action: "put",
                path: "hello",
                progress: 1,
            });
            expect(parseSyncEvent('{"type":"complete","seq":1}')).toMatchObject({
                type: "complete",
            });
        });
    });

    describe("errors", () => {
        it("tells the disabled-files errors from the rest", () => {
            expect(
                parseSyncError("Error: Files in Workspace is disabled for this workspace"),
            ).toEqual({ kind: "filesInWorkspaceDisabled" });
            expect(parseSyncError("Error: Files in Repos is disabled")).toEqual({
                kind: "filesInReposDisabled",
            });
            expect(parseSyncError("Error: no such host")).toEqual({
                kind: "error",
                reason: "no such host",
            });
            expect(parseSyncError("Warning: Error: not at the start")).toBeUndefined();
            expect(parseSyncError("Uploaded a.py")).toBeUndefined();
        });
    });

    it("reads an event that the process writes in two chunks", async () => {
        const cli = new Cli(nodeProcessRunner, () => process.execPath, new Log([], "Test"));
        const script = `process.stdout.write('{"type":"sta'); setTimeout(() => process.stdout.write('rt","put":["a.py"]}\\n{"type":"complete"}\\n'), 100);`;
        const events: unknown[] = [];
        const handle = cli.start(["-e", script], {
            env: { PATH: process.env.PATH ?? "" },
            onStdoutLine: (line) => events.push(parseSyncEvent(line)),
        });
        expect(await handle.exited).toMatchObject({ exitCode: 0, cancelled: false });
        expect(events).toEqual([{ type: "start", put: ["a.py"] }, { type: "complete" }]);
    });
});
