import {Time, TimeUnits, logging} from "@databricks/sdk-experimental";
import assert from "assert";
import {mkdtemp, readFile} from "fs/promises";
import {remove} from "fs-extra";
import {tmpdir} from "os";
import path from "path";
import {instance, mock, when} from "ts-mockito";
import {ExtensionContext, Uri} from "vscode";
import {LoggerManager, Loggers, RevealCommandApi} from "./LoggerManager";

const EXTENSION_ID = "databricks.databricks";
const CHANNEL = "Databricks Logs" as const;
const SCOPED_REVEAL = `workbench.action.output.show.${EXTENSION_ID}.${CHANNEL}.workspaceId-abc123`;

describe(__filename, function () {
    let tempDir: string;

    this.timeout(new Time(5, TimeUnits.seconds).toMillSeconds().value);

    beforeEach(async () => {
        tempDir = await mkdtemp(path.join(tmpdir(), "testdir-"));
    });

    function createManager(commandApi?: Partial<RevealCommandApi>) {
        const mockContext = mock<ExtensionContext>();
        when(mockContext.logUri).thenReturn(Uri.file(tempDir));
        when(mockContext.extension).thenReturn({id: EXTENSION_ID} as any);
        return new LoggerManager(instance(mockContext), {
            getCommands: async () => [],
            executeCommand: async () => undefined,
            ...commandApi,
        });
    }

    it("should reveal an output channel without throwing", async () => {
        const manager = createManager();
        await manager.showOutputChannel(CHANNEL);
    });

    it("should reveal via the scoped command when the host registers one", async () => {
        const executed: string[] = [];
        const manager = createManager({
            getCommands: async () => [SCOPED_REVEAL],
            executeCommand: async (command) => {
                executed.push(command);
            },
        });

        await manager.showOutputChannel(CHANNEL);

        assert.deepStrictEqual(executed, [SCOPED_REVEAL]);
    });

    it("should cache the resolved command and not re-enumerate", async () => {
        let getCommandsCalls = 0;
        const executed: string[] = [];
        const manager = createManager({
            getCommands: async () => {
                getCommandsCalls++;
                return [SCOPED_REVEAL];
            },
            executeCommand: async (command) => {
                executed.push(command);
            },
        });

        await manager.showOutputChannel(CHANNEL);
        await manager.showOutputChannel(CHANNEL);

        assert.strictEqual(getCommandsCalls, 1);
        assert.deepStrictEqual(executed, [SCOPED_REVEAL, SCOPED_REVEAL]);
    });

    it("should cache the 'use show()' sentinel when the ids agree", async () => {
        let getCommandsCalls = 0;
        let executeCalls = 0;
        const manager = createManager({
            getCommands: async () => {
                getCommandsCalls++;
                // Exact id registered -> plain show() is correct.
                return [
                    `workbench.action.output.show.${EXTENSION_ID}.${CHANNEL}`,
                ];
            },
            executeCommand: async () => {
                executeCalls++;
            },
        });

        // First reveal creates the channel (the just-created retry path, which
        // never caches). Production pre-creates channels at activation, so the
        // interesting case is the subsequent reveals below.
        await manager.showOutputChannel(CHANNEL);
        getCommandsCalls = 0;

        await manager.showOutputChannel(CHANNEL);
        await manager.showOutputChannel(CHANNEL);

        // First resolves and caches the sentinel; second reuses it.
        assert.strictEqual(getCommandsCalls, 1);
        assert.strictEqual(executeCalls, 0);
    });

    it("should evict the cache and re-resolve after a failed executeCommand", async () => {
        let getCommandsCalls = 0;
        let shouldFail = true;
        const executed: string[] = [];
        const manager = createManager({
            getCommands: async () => {
                getCommandsCalls++;
                return [SCOPED_REVEAL];
            },
            executeCommand: async (command) => {
                if (shouldFail) {
                    throw new Error("stale command");
                }
                executed.push(command);
            },
        });

        // First call fails and falls back to show(), evicting the cache entry.
        await manager.showOutputChannel(CHANNEL);
        assert.strictEqual(getCommandsCalls, 1);

        // Next call must re-resolve rather than reuse the evicted entry.
        shouldFail = false;
        await manager.showOutputChannel(CHANNEL);
        assert.strictEqual(getCommandsCalls, 2);
        assert.deepStrictEqual(executed, [SCOPED_REVEAL]);
    });

    it("should retry resolving the reveal command for a just-created channel", async () => {
        let getCommandsCalls = 0;
        const executed: string[] = [];
        const manager = createManager({
            getCommands: async () => {
                getCommandsCalls++;
                // Registered only on the retry, mimicking async workbench registration.
                return getCommandsCalls > 1 ? [SCOPED_REVEAL] : [];
            },
            executeCommand: async (command) => {
                executed.push(command);
            },
        });

        await manager.showOutputChannel(CHANNEL);

        assert.strictEqual(getCommandsCalls, 2);
        assert.deepStrictEqual(executed, [SCOPED_REVEAL]);
    });

    it("should create log file and log data", async () => {
        const mockContext = mock<ExtensionContext>();
        when(mockContext.logUri).thenReturn(Uri.file(tempDir));

        const manager = new LoggerManager(instance(mockContext));
        await manager.initLoggers();
        logging.NamedLogger.getOrCreate(Loggers.Extension).debug(
            "test message"
        );

        await new Promise((resolve) =>
            setTimeout(
                resolve,
                new Time(0.5, TimeUnits.seconds).toMillSeconds().value
            )
        );
        const logfile = path.join(tempDir, "sdk-and-extension-logs.json");
        const rawLogs = await readFile(logfile, {encoding: "utf-8"});

        const logs = rawLogs.split("\n");
        assert.ok(logs.length !== 0);
        assert.ok(logs[0].includes("test message"));
    });

    afterEach(async () => {
        await new Promise((resolve) => remove(tempDir, resolve));
    });
});
