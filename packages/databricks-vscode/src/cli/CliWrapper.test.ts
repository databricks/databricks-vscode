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
import {when, spy, reset, instance, mock} from "ts-mockito";
import {CliWrapper} from "./CliWrapper";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import {Context} from "@databricks/databricks-sdk/dist/context";
import {logging} from "@databricks/databricks-sdk";
import {LoggerManager} from "../logger";
import {ProfileAuthProvider} from "../configuration/auth/AuthProvider";
import {isMatch} from "lodash";
import {removeUndefinedKeys} from "../utils/envVarGenerators";

const execFile = promisify(execFileCb);
const cliPath = path.join(__dirname, "../../bin/databricks");

// eslint-disable-next-line @typescript-eslint/no-var-requires
const extensionVersion = require("../../package.json").version;

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
        instance(mock(LoggerManager)),
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
        const cli = createCliWrapper(logFilePath);
        await execFile(cli.cliPath, ["version", ...cli.getLoggingArguments()]);
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
        const loggingArgs = `--log-level debug --log-file ${logFilePath} --log-format json`;
        let {command, args} = cli.getSyncCommand(mapper, "incremental");
        assert.equal(
            [command, ...args].join(" "),
            [syncCommand, loggingArgs].join(" ")
        );

        ({command, args} = cli.getSyncCommand(mapper, "full"));
        assert.equal(
            [command, ...args].join(" "),
            [syncCommand, loggingArgs, "--full"].join(" ")
        );

        const configsSpy = spy(workspaceConfigs);
        mocks.push(configsSpy);
        when(configsSpy.loggingEnabled).thenReturn(false);
        ({command, args} = cli.getSyncCommand(mapper, "incremental"));
        assert.equal([command, ...args].join(" "), syncCommand);
    });

    it("should list profiles when no config file exists", async () => {
        const logFilePath = getTempLogFilePath();
        const cli = createCliWrapper(logFilePath);
        const profiles = await cli.listProfiles("/tmp/does-not-exist");
        assert.equal(profiles.length, 0);
    });

    // TODO: Don't skip this after cli is updated to > 0.218.0
    it.skip("should list profiles", async function () {
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

            assert.equal(profiles[1].name, "STAGING");
            assert.equal(
                profiles[1].host,
                "https://staging.cloud.databricks.com/"
            );
        });
    });

    // TODO: Don't skip this after cli is updated to > 0.218.0
    it.skip("should load all valid profiles and return errors for rest", async () => {
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

`
            );
            const profiles = await cli.listProfiles(path);
            assert.equal(profiles.length, 2);

            assert.equal(profiles[0].name, "correct");
            assert.equal(profiles[0].host, "https://cloud.databricks.com/");

            assert.equal(profiles[1].name, "no-token");
            assert.equal(profiles[1].host, "https://cloud.databricks.com/");
            assert.equal(profiles[1].authType, "");
        });
    });

    it("should show error for corrupted config file and return empty profile list", async () => {
        const logFilePath = getTempLogFilePath();
        const cli = createCliWrapper(logFilePath);

        await withFile(async ({path}) => {
            await writeFile(path, `[bad]\ntest 123`);
            const logs: {level: string; msg?: string; meta: any}[] = [];
            const profiles = await cli.listProfiles(
                path,
                new Context({
                    logger: logging.NamedLogger.getOrCreate(
                        "cli-parsing-error-test",
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
            const errorLog = logs.find(
                (log) =>
                    log.msg?.includes("Failed to parse Databricks Config File")
            );
            assert.ok(errorLog !== undefined);
            assert.ok(errorLog.level === "error");
            assert.equal(profiles.length, 0);
        });
    });

    it("should set required env vars to the bundle run CLI calls", async () => {
        const logFilePath = getTempLogFilePath();
        const cli = createCliWrapper(logFilePath);
        const authProvider = new ProfileAuthProvider(
            new URL("https://test.com"),
            "PROFILE",
            cli,
            true
        );
        const workspaceFolder = Uri.file("/test/123");
        const runCmd = cli.getBundleRunCommand(
            "dev",
            authProvider,
            "resource-key",
            workspaceFolder
        );
        const expected = {
            args: ["bundle", "run", "--target", "dev", "resource-key"],
            cmd: cli.cliPath,
            options: {
                cwd: workspaceFolder.fsPath,
                env: removeUndefinedKeys({
                    /* eslint-disable @typescript-eslint/naming-convention */
                    DATABRICKS_CLI_UPSTREAM: "databricks-vscode",
                    DATABRICKS_CLI_UPSTREAM_VERSION: extensionVersion,
                    DATABRICKS_CONFIG_PROFILE: "PROFILE",
                    DATABRICKS_HOST: "https://test.com/",
                    DATABRICKS_LOG_FILE: logFilePath,
                    DATABRICKS_LOG_FORMAT: "json",
                    DATABRICKS_LOG_LEVEL: "debug",
                    DATABRICKS_OUTPUT_FORMAT: "json",
                    HOME: process.env.HOME,
                    PATH: process.env.PATH,
                    /* eslint-enable @typescript-eslint/naming-convention */
                }),
                shell: true,
            },
        };
        try {
            assert.ok(isMatch(runCmd, expected));
        } catch (e) {
            // Run this in the "catch" case to show better error messages
            assert.deepStrictEqual(runCmd, expected);
            throw e;
        }
    });
});
