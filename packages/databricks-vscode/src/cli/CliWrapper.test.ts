import * as assert from "assert";
import {Uri} from "vscode";
import {
    LocalUri,
    RemoteUri,
    SyncDestinationMapper,
} from "../sync/SyncDestination";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {promisify} from "node:util";
import {execFile as execFileCb} from "node:child_process";
import {withFile} from "tmp-promise";
import {writeFile, readFile} from "node:fs/promises";
import {when, spy, reset} from "ts-mockito";
import {CliWrapper} from "./CliWrapper";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import {Context} from "@databricks/databricks-sdk/dist/context";
import {logging} from "@databricks/databricks-sdk";

const execFile = promisify(execFileCb);
const cliPath = path.join(__dirname, "../../bin/databricks");

function getTempLogFilePath() {
    return path.join(
        os.tmpdir(),
        `databricks-cli-logs-${crypto.randomUUID()}.json`
    );
}

function createCliWrapper(logFilePath?: string) {
    return new CliWrapper(
        {
            asAbsolutePath(relativePath: string) {
                return path.join(__dirname, "../..", relativePath);
            },
        } as any,
        logFilePath
    );
}

describe(__filename, () => {
    it("should embed a working databricks CLI", async () => {
        const result = await execFile(cliPath, ["--help"]);
        assert.ok(result.stdout.indexOf("databricks") > 0);
    });

    let mocks: any[] = [];
    afterEach(() => {
        mocks.forEach((mock) => reset(mock));
        mocks = [];
    });

    it("should tell CLI to log its output to a file", async () => {
        const logFilePath = getTempLogFilePath();
        const configsSpy = spy(workspaceConfigs);
        mocks.push(configsSpy);
        when(configsSpy.loggingEnabled).thenReturn(true);
        when(configsSpy.cliVerboseMode).thenReturn(true);
        const cli = createCliWrapper(logFilePath);
        await execFile(cli.cliPath, ["version", ...cli.loggingArguments]);
        const file = await readFile(logFilePath);
        // Just checking if the file is not empty to avoid depending on internal CLI log patterns
        assert.ok(file.toString().length > 0);
    });

    it("should create sync commands", async () => {
        const logFilePath = getTempLogFilePath();
        const cli = createCliWrapper(logFilePath);
        const mapper = new SyncDestinationMapper(
            new LocalUri(Uri.file("/user/project")),
            new RemoteUri(
                Uri.from({
                    scheme: "wsfs",
                    path: "/Repos/user@databricks.com/project",
                })
            )
        );

        const syncCommand = `${cliPath} sync . /Repos/user@databricks.com/project --watch --output json`;
        let {command, args} = cli.getSyncCommand(mapper, "incremental");
        assert.equal(
            [command, ...args].join(" "),
            [
                syncCommand,
                `--log-level error --log-file ${logFilePath} --log-format json`,
            ].join(" ")
        );

        ({command, args} = cli.getSyncCommand(mapper, "full"));
        assert.equal(
            [command, ...args].join(" "),
            [
                syncCommand,
                `--log-level error --log-file ${logFilePath} --log-format json`,
                "--full",
            ].join(" ")
        );

        const configsSpy = spy(workspaceConfigs);
        mocks.push(configsSpy);
        when(configsSpy.loggingEnabled).thenReturn(false);
        ({command, args} = cli.getSyncCommand(mapper, "incremental"));
        assert.equal([command, ...args].join(" "), syncCommand);

        when(configsSpy.loggingEnabled).thenReturn(true);
        when(configsSpy.cliVerboseMode).thenReturn(true);
        ({command, args} = cli.getSyncCommand(mapper, "incremental"));
        assert.equal(
            [command, ...args].join(" "),
            [
                syncCommand,
                `--log-level debug --log-file ${logFilePath} --log-format json`,
            ].join(" ")
        );
    });

    it("should create an 'add profile' command", () => {
        const cli = createCliWrapper();

        const {command, args} = cli.getAddProfileCommand(
            "DEFAULT",
            new URL("https://databricks.com")
        );

        assert.equal(
            [command, ...args].join(" "),
            `${cliPath} configure --no-interactive --profile DEFAULT --host https://databricks.com/ --token`
        );
    });

    it("should list profiles when no config file exists", async () => {
        const logFilePath = getTempLogFilePath();
        const cli = createCliWrapper(logFilePath);
        const profiles = await cli.listProfiles("/tmp/does-not-exist");
        assert.equal(profiles.length, 0);
    });

    it("should list profiles", async function () {
        const logFilePath = getTempLogFilePath();
        const cli = createCliWrapper(logFilePath);

        await withFile(async ({path}) => {
            await writeFile(
                path,
                `
        host = https://cloud.databricks.com/
        token = dapitest1234

        [STAGING]
        host = https://staging.cloud.databricks.com/
        token = dapitest54321
        `
            );

            const profiles = await cli.listProfiles(path);

            assert.equal(profiles.length, 2);
            assert.equal(profiles[0].name, "DEFAULT");
            assert.equal(profiles[0].host, "https://cloud.databricks.com/");
            assert.equal(profiles[0].authType, "pat");

            assert.equal(profiles[1].name, "STAGING");
            assert.equal(
                profiles[1].host,
                "https://staging.cloud.databricks.com/"
            );
            assert.equal(profiles[1].authType, "pat");
        });
    });

    it("should load all valid profiles and return errors for rest", async () => {
        const logFilePath = getTempLogFilePath();
        const cli = createCliWrapper(logFilePath);

        await withFile(async ({path}) => {
            await writeFile(
                path,
                `[correct]
host = https://cloud.databricks.com/
token = dapitest1234

[no-host]
token = dapitest54321

[no-token]
host = https://cloud.databricks.com/

[missing-host-token]
nothing = true

[typo-host]
host = example.com
`
            );

            const logs: {level: string; msg?: string; meta: any}[] = [];
            const profiles = await cli.listProfiles(
                path,
                new Context({
                    logger: logging.NamedLogger.getOrCreate(
                        "cli-wrapper-test",
                        {
                            factory: () => {
                                return {
                                    log: (level, msg, meta) => {
                                        logs.push({level, msg, meta});
                                    },
                                };
                            },
                        }
                    ),
                })
            );
            assert.equal(profiles.length, 2);

            assert.equal(profiles[0].name, "correct");
            assert.equal(profiles[0].host, "https://cloud.databricks.com/");
            assert.equal(profiles[0].authType, "pat");

            assert.equal(profiles[1].name, "no-token");
            assert.equal(profiles[1].host, "https://cloud.databricks.com/");
            assert.equal(profiles[1].authType, "");

            const typoLog = logs.find((log) => log.msg?.includes("typo-host"));
            assert.ok(typoLog !== undefined);
            assert.ok(typoLog.level === "error");
        });
    });
});
