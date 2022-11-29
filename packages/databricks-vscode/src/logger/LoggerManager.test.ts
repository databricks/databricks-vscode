import "@databricks/databricks-sdk/dist";
import {Time, TimeUnits} from "@databricks/databricks-sdk/dist";
import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";
import assert from "assert";
import {mkdtemp, readFile} from "fs/promises";
import {remove} from "fs-extra";
import {tmpdir} from "os";
import path from "path";
import {instance, mock, when} from "ts-mockito";
import {ExtensionContext, Uri} from "vscode";
import {LoggerManager, Loggers} from "./LoggerManager";

describe(__filename, function () {
    let tempDir: string;

    this.timeout(new Time(5, TimeUnits.seconds).toMillSeconds().value);

    beforeEach(async () => {
        tempDir = await mkdtemp(path.join(tmpdir(), "testdir-"));
    });

    it("should create log file and log data", async () => {
        const mockContext = mock<ExtensionContext>();
        when(mockContext.logUri).thenReturn(Uri.file(tempDir));

        const manager = new LoggerManager(instance(mockContext));
        await manager.initLoggers();
        NamedLogger.getOrCreate(Loggers.Extension).debug("test message");

        await new Promise((resolve) =>
            setTimeout(
                resolve,
                new Time(0.5, TimeUnits.seconds).toMillSeconds().value
            )
        );

        const rawLogs = await readFile(path.join(tempDir, "logs.json"), {
            encoding: "utf-8",
        });

        const logs = rawLogs.split("\n");
        assert.ok(logs.length !== 0);
        assert.ok(logs[0].includes("test message"));
    });

    afterEach(async () => {
        await new Promise((resolve) => remove(tempDir, resolve));
    });
});
