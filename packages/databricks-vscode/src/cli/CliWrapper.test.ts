import * as assert from "assert";
import {CancellationTokenSource, commands, Uri, window} from "vscode";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {promisify} from "node:util";
import {execFile as execFileCb} from "node:child_process";
import {withFile} from "tmp-promise";
import {writeFile, readFile, mkdtemp, rm} from "node:fs/promises";
import {when, spy, reset, instance, mock} from "ts-mockito";
import {
    cancellableExecFile,
    CliWrapper,
    ProcessError,
    getSshConnectCommand,
    waitForProcess,
} from "./CliWrapper";
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
            assert.ok(typeof result.release === "string", "expected release");
            assert.ok(Array.isArray(result.skills), "expected skills");
            assert.ok(result.skills.length > 0, "expected non-empty skills");
            const skill = result.skills[0];
            assert.ok(typeof skill.name === "string", "expected skill name");
            assert.ok(
                typeof skill.latest_version === "string",
                "expected skill latest version"
            );
            assert.ok(
                typeof skill.installed === "object",
                "expected skill installed object"
            );

            // It also reports the coding agents it knows about, each with a
            // display name and detection/management flags; the agent picker
            // relies on these fields.
            assert.ok(Array.isArray(result.agents));
            assert.ok(result.agents.length > 0);
            const agent = result.agents[0];
            assert.ok(typeof agent.name === "string");
            assert.ok(typeof agent.display_name === "string");
            assert.ok(typeof agent.managed === "boolean");
            assert.ok(typeof agent.detected === "boolean");
            // Optional: older CLIs omit it, and callers default absence to
            // "supported" (see computeAgentsStatuses).
            assert.ok(
                agent.supports_project_scope === undefined ||
                    typeof agent.supports_project_scope === "boolean"
            );
            assert.ok(typeof agent.installed === "object");
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

    it("should create ssh connect commands", () => {
        // Logging is configured via env vars, not CLI flags, so no --log-*
        // args appear on the ssh connect command line.

        // Serverless: no --cluster / --auto-start-cluster.
        let {args} = getSshConnectCommand({compute: {type: "serverless"}});
        assert.deepStrictEqual(args, [
            "ssh",
            "connect",
            "--ide=vscode",
            "--auto-approve",
        ]);

        // Serverless GPU: --accelerator, no --cluster / --auto-start-cluster.
        ({args} = getSshConnectCommand({
            compute: {type: "serverless", accelerator: "GPU_1xA10"},
        }));
        assert.deepStrictEqual(args, [
            "ssh",
            "connect",
            "--ide=vscode",
            "--auto-approve",
            "--accelerator=GPU_1xA10",
        ]);

        // Dedicated cluster: --cluster and --auto-start-cluster.
        ({args} = getSshConnectCommand({
            compute: {type: "cluster", clusterId: "1234-clusterid"},
        }));
        assert.deepStrictEqual(args, [
            "ssh",
            "connect",
            "--ide=vscode",
            "--auto-approve",
            "--cluster=1234-clusterid",
            "--auto-start-cluster",
        ]);
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

    it("should forward auth to the setup-local env vars", async () => {
        const logFilePath = getTempLogFilePath();
        const cli = createCliWrapper(logFilePath);
        const authProvider = new ProfileAuthProvider(
            new URL("https://test.com"),
            "PROFILE",
            cli,
            true
        );

        const env = cli.getSetupLocalEnvVars(authProvider, "dev");

        // The two vars this exists for: the CLI resolves auth itself, so the
        // profile and host must arrive via the environment.
        assert.equal(env.DATABRICKS_CONFIG_PROFILE, "PROFILE");
        assert.equal(env.DATABRICKS_HOST, "https://test.com/");
        // Inherited from getEnvVarsForCli and left alone: it agrees with the
        // explicit `--output json` on the argv that the result parser needs.
        // The bundle-init/ssh-connect flows override this to "text" because they
        // render CLI output to a terminal; this flow must not.
        assert.equal(env.DATABRICKS_OUTPUT_FORMAT, "json");
    });

    it("should pin the bundle target alongside the profile for setup-local", async () => {
        const logFilePath = getTempLogFilePath();
        const cli = createCliWrapper(logFilePath);
        const authProvider = new ProfileAuthProvider(
            new URL("https://test.com"),
            "PROFILE",
            cli,
            true
        );

        // Without a --profile flag the CLI loads the bundle and picks its
        // *default* target, then rejects the run when that target's host
        // disagrees with the injected profile's host. The target must travel
        // with the profile so the two always refer to the same workspace.
        assert.equal(
            cli.getSetupLocalEnvVars(authProvider, "prod")
                .DATABRICKS_BUNDLE_TARGET,
            "prod"
        );

        // No target selected yet: omit the var rather than pass an empty
        // string, which the CLI would treat as an explicit (invalid) target.
        assert.ok(
            !(
                "DATABRICKS_BUNDLE_TARGET" in
                cli.getSetupLocalEnvVars(authProvider, undefined)
            )
        );
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
        // Drive the process through a cancellation token so we can kill the
        // lingering `cat` (which would otherwise read stdin forever) once
        // we've confirmed it hasn't completed on its own.
        const tokenSource = new CancellationTokenSource();
        const execPromise = cancellableExecFile(
            "cat",
            [],
            {},
            tokenSource.token
        );
        // Swallow the abort rejection so it doesn't surface as an unhandled
        // rejection after the test finishes.
        const settled = execPromise.then(
            () => "completed",
            () => "aborted"
        );
        try {
            const raced = await Promise.race([
                settled,
                new Promise((resolve) =>
                    setTimeout(() => resolve("timed-out"), 500)
                ),
            ]);
            assert.strictEqual(raced, "timed-out");
        } finally {
            tokenSource.cancel();
            tokenSource.dispose();
            await settled;
        }
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

describe("ProcessError.showErrorMessage", () => {
    let originalShowError: typeof window.showErrorMessage;
    let originalExecuteCommand: typeof commands.executeCommand;
    let executed: string[];

    beforeEach(() => {
        executed = [];
        originalShowError = window.showErrorMessage;
        // Resolve as if the user clicked the primary action button (the last
        // vararg), so both the "Show Logs" and "Assign Values" branches fire.
        (window as any).showErrorMessage = async (
            _message: string,
            ...items: string[]
        ) => items[items.length - 1];
        originalExecuteCommand = commands.executeCommand;
        (commands as any).executeCommand = (command: string) => {
            executed.push(command);
        };
    });

    afterEach(() => {
        (window as any).showErrorMessage = originalShowError;
        (commands as any).executeCommand = originalExecuteCommand;
    });

    // `showErrorMessage` handles the toast promise with `.then` (fire and
    // forget), so a microtask tick is needed before the executeCommand runs.
    async function flush() {
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    it("opens the bundle logs channel by default", async () => {
        new ProcessError("boom", 1).showErrorMessage("Prefix.");
        await flush();
        assert.deepStrictEqual(executed, ["databricks.bundle.showLogs"]);
    });

    it("opens the given logs channel when one is passed", async () => {
        new ProcessError("boom", 1).showErrorMessage(
            "Prefix.",
            "databricks.internal.showOutput"
        );
        await flush();
        assert.deepStrictEqual(executed, ["databricks.internal.showOutput"]);
    });

    it("ignores the logsCommand for the missing-variable path", async () => {
        // The "no value assigned to required variable" branch has its own
        // fixed set of commands and never consults logsCommand.
        new ProcessError(
            "no value assigned to required variable foo",
            1
        ).showErrorMessage("Prefix.", "databricks.internal.showOutput");
        await flush();
        assert.ok(!executed.includes("databricks.internal.showOutput"));
        assert.ok(executed.includes("databricks.bundle.showLogs"));
    });
});
