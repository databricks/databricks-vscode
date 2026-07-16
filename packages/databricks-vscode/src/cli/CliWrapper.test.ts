import * as assert from "assert";
import {Uri} from "vscode";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {promisify} from "node:util";
import {execFile as execFileCb} from "node:child_process";
import {withFile} from "tmp-promise";
import {writeFile, readFile, mkdtemp, rm} from "node:fs/promises";
import {when, spy, reset, instance, mock} from "ts-mockito";
import {cancellableExecFile, CliWrapper, waitForProcess} from "./CliWrapper";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import {Context} from "@databricks/sdk-experimental/dist/context";
import {logging} from "@databricks/sdk-experimental";
import {LoggerManager} from "../logger";
import {ProfileAuthProvider} from "../configuration/auth/AuthProvider";
import {isMatch} from "lodash";
import {removeUndefinedKeys} from "../utils/envVarGenerators";
import {writeFileSync} from "fs";
import {ChildProcess, ChildProcessWithoutNullStreams} from "child_process";
import {Readable} from "stream";

const execFile = promisify(execFileCb);
// Mirror CliWrapper.cliPath: the bundled binary is `databricks.exe` on Windows.
const cliPath = path.join(
    __dirname,
    "../../bin/" +
        (process.platform === "win32" ? "databricks.exe" : "databricks")
);

// eslint-disable-next-line @typescript-eslint/no-require-imports
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

describe(__filename, function () {
    this.timeout("10s");

    it("should embed a working databricks CLI", async () => {
        const result = await execFile(cliPath, ["--help"]);
        assert.ok(result.stdout.indexOf("databricks") > 0);
    });

    it("aitoolsList returns parsed JSON from the bundled CLI", async () => {
        const cli = createCliWrapper();
        const tmpDir = await mkdtemp(path.join(os.tmpdir(), "aitools-cli-"));
        try {
            const result = await cli.aitoolsList(tmpDir);
            // The bundled CLI reports the release and the full skill catalog,
            // each with a latest_version and an installed map, even when nothing
            // is installed in the (empty) temp dir.
            assert.ok(typeof result.release === "string");
            assert.ok(Array.isArray(result.skills));
            assert.ok(result.skills.length > 0);
            const skill = result.skills[0];
            assert.ok(typeof skill.name === "string");
            assert.ok(typeof skill.latest_version === "string");
            assert.ok(typeof skill.installed === "object");
        } finally {
            await rm(tmpDir, {recursive: true, force: true});
        }
    });

    it("should resolve the platform-specific CLI binary name", () => {
        const cli = createCliWrapper();
        const originalPlatform = process.platform;
        const setPlatform = (platform: NodeJS.Platform) =>
            Object.defineProperty(process, "platform", {value: platform});
        try {
            // On Windows the bundled binary is `databricks.exe`. The `.exe` is
            // required because cliPath is forwarded to the SDK/Terraform via
            // DATABRICKS_CLI_PATH, which does a literal (no auto-`.exe`) lookup.
            setPlatform("win32");
            assert.ok(
                cli.cliPath.endsWith(path.join("bin", "databricks.exe")),
                `expected win32 cliPath to end with bin/databricks.exe, got ${cli.cliPath}`
            );

            for (const platform of ["linux", "darwin"] as NodeJS.Platform[]) {
                setPlatform(platform);
                assert.ok(
                    cli.cliPath.endsWith(path.join("bin", "databricks")),
                    `expected ${platform} cliPath to end with bin/databricks, got ${cli.cliPath}`
                );
            }
        } finally {
            setPlatform(originalPlatform);
        }
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

        const syncCommand = `${cliPath} bundle sync --watch --output json`;
        const loggingArgs = `--log-level debug --log-file ${logFilePath} --log-format json`;
        let {command, args} = cli.getSyncCommand("incremental");
        assert.equal(
            [command, ...args].join(" "),
            [syncCommand, loggingArgs].join(" ")
        );

        ({command, args} = cli.getSyncCommand("full"));
        assert.equal(
            [command, ...args].join(" "),
            [syncCommand, loggingArgs, "--full"].join(" ")
        );

        const configsSpy = spy(workspaceConfigs);
        mocks.push(configsSpy);
        when(configsSpy.loggingEnabled).thenReturn(false);
        ({command, args} = cli.getSyncCommand("incremental"));
        assert.equal([command, ...args].join(" "), syncCommand);
    });

    it("should list profiles when no config file exists", async () => {
        const logFilePath = getTempLogFilePath();
        const cli = createCliWrapper(logFilePath);
        const profiles = await cli.listProfiles("/tmp/does-not-exist");
        assert.equal(profiles.length, 0);
    });

    it("should list profiles", async () => {
        const logFilePath = getTempLogFilePath();
        const cli = createCliWrapper(logFilePath);

        await withFile(async ({path}) => {
            writeFileSync(
                path,
                `
host = https://cloud.databricks.com/
token = dapitest1234

[STAGING]
host = https://staging.cloud.databricks.com/
token = dapitest54321
`,
                "utf-8"
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

    it("should load all valid profiles", async () => {
        const logFilePath = getTempLogFilePath();
        const cli = createCliWrapper(logFilePath);

        await withFile(async ({path}) => {
            writeFileSync(
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
`,
                "utf-8"
            );

            const profiles = await cli.listProfiles(path);
            assert.equal(profiles.length, 2);

            assert.equal(profiles[0].name, "correct");
            assert.equal(profiles[0].host, "https://cloud.databricks.com/");

            assert.equal(profiles[1].name, "no-token");
            assert.equal(profiles[1].host, "https://cloud.databricks.com/");
        });
    });

    it("should include profiles with account id", async () => {
        const logFilePath = getTempLogFilePath();
        const cli = createCliWrapper(logFilePath);

        await withFile(async ({path}) => {
            writeFileSync(
                path,
                `[regular-profile]
host = https://cloud.databricks.com/
token = dapitest1234

[profile-with-account-id]
host = https://accounts.cloud.databricks.com/
account_id = 1234567890
token = dapitest5678
`,
                "utf-8"
            );

            const profiles = await cli.listProfiles(path);

            assert.equal(profiles.length, 2);
            assert.equal(profiles[0].name, "regular-profile");
            assert.equal(profiles[1].name, "profile-with-account-id");
            assert.equal(profiles[1].accountId, "1234567890");
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
        const runCmd = await cli.getBundleRunCommand(
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

describe("cancellableExecFile closeStdin", () => {
    // `cat` with no args reads stdin until EOF. Without closeStdin the child's
    // stdin pipe stays open forever and the call hangs; closeStdin sends EOF so
    // it completes. This mirrors why `aitools update` hung on launch when it
    // prompted for confirmation.
    it("completes a stdin-reading process when closeStdin is set", async () => {
        const {stdout} = await cancellableExecFile("cat", [], {}, undefined, {
            closeStdin: true,
        });
        assert.strictEqual(stdout, "");
    });

    it("hangs on a stdin-reading process without closeStdin", async () => {
        const raced = await Promise.race([
            cancellableExecFile("cat", []).then(() => "completed"),
            new Promise((resolve) =>
                setTimeout(() => resolve("timed-out"), 500)
            ),
        ]);
        assert.strictEqual(raced, "timed-out");
    });
});

describe("waitForProcess", () => {
    it("should return correctly formatted stdout and stderr", async () => {
        const process = new ChildProcess();
        const stdoutChunks = [`{"hello": "wor`, `ld"}`];
        const stderrChunks = [`{"error": "no`, `oo"}`];
        process.stdout = new Readable({
            read() {
                this.push(stdoutChunks.shift());
            },
        });
        process.stderr = new Readable({
            read() {
                this.push(stderrChunks.shift());
            },
        });
        const waitPromise = waitForProcess(
            process as ChildProcessWithoutNullStreams
        );
        process.emit("close", 0);
        const {stdout, stderr} = await waitPromise;
        assert.equal(stdout, `{"hello": "world"}`);
        assert.equal(stderr, `{"error": "nooo"}`);
    });
});
