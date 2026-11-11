import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChannelSink, JsonFileSink, Log, type LogChannel } from "./log";

const dirs: string[] = [];
function tempFile() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "log-test-"));
    dirs.push(dir);
    return path.join(dir, "nested", "sdk-and-extension-logs.json");
}
afterEach(() => {
    dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
});

/** Ends the sink's stream, then waits until the file holds `entries` complete lines: the stream writes them asynchronously. */
async function close(sink: JsonFileSink, file: string, entries: number) {
    sink.dispose();
    await vi.waitFor(() => {
        const text = fs.readFileSync(file, "utf-8");
        expect(text.endsWith("\n") && text.trim().split("\n")).toHaveLength(entries);
    });
}

describe("JsonFileSink", () => {
    it("writes one JSON object per line, at every level, and recreates the file", async () => {
        const file = tempFile();
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, "stale\n");

        const sink = new JsonFileSink(file);
        const log = new Log([sink], "Extension", () => new Date(0));
        log.trace("t");
        log.child("commands").error("failed", new Error("boom"));
        await close(sink, file, 2);

        const lines = fs
            .readFileSync(file, "utf-8")
            .trim()
            .split("\n")
            .map((l) => JSON.parse(l));
        expect(lines).toHaveLength(2);
        expect(lines[0]).toEqual({
            timestamp: "1970-01-01T00:00:00.000Z",
            level: "trace",
            logger: "Extension",
            message: "t",
        });
        expect(lines[1].logger).toBe("Extension.commands");
        expect(lines[1].data[0]).toMatchObject({ name: "Error", message: "boom" });
    });

    it("survives values JSON can't represent", async () => {
        const file = tempFile();
        const sink = new JsonFileSink(file);
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        new Log([sink], "x").info("odd", cyclic, 10n);
        await close(sink, file, 1);
        expect(JSON.parse(fs.readFileSync(file, "utf-8")).data).toEqual([
            { self: "[Circular]" },
            "10",
        ]);
    });
});

describe("ChannelSink", () => {
    it("writes through the channel method for the level, tagged with the logger", () => {
        const calls: string[] = [];
        const record = (level: string) => (message: string) => calls.push(`${level} ${message}`);
        const channel: LogChannel = {
            trace: record("trace"),
            debug: record("debug"),
            info: record("info"),
            warn: record("warn"),
            error: record("error"),
        };
        const log = new Log([new ChannelSink(channel)], "Extension");
        log.warn("careful");
        log.child("onboarding").info("hi");
        expect(calls).toEqual(["warn [Extension] careful", "info [Extension.onboarding] hi"]);
    });

    it("never lets a failing sink throw", () => {
        const broken = {
            write: () => {
                throw new Error("no");
            },
            dispose: () => {},
        };
        expect(() => new Log([broken], "x").error("e")).not.toThrow();
    });
});
