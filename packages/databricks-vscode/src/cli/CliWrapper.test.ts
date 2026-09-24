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
    getCliVersion,
    parseAiToolsInstallOutput,
    parseCliVersion,
} from "./CliWrapper";
import {EXTENSION_DEVELOPMENT} from "../utils/developmentUtils";
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

const execFile = promisify(execFileCb);
// Mirror CliWrapper.cliPath: the bundled binary is `databricks.exe` on Windows.
const cliPath = path.join(
    __dirname,
    "../../bin/" +
        (process.platform === "win32" ? "databricks.exe" : "databricks")
);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const extensionVersion = require("../../package.json").version;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pinnedCliVersion = require("../../package.json").cli.version;

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

// Writes a fake `databricks` CLI that prints `output` as JSON when run with any
// args, and returns its path. On POSIX this is a shebang bash script marked
// executable. On Windows the CLI is invoked through `cmd.exe` (see
// getEscapedCommandAndArgs), which needs a recognised executable extension and
// can't run a shebang, so we emit a `.cmd` batch script instead. The JSON
// contains no cmd.exe metacharacters (<>&|%^), so `echo` prints it verbatim.
async function writeFakeCli(
    dir: string,
    baseName: string,
    output: unknown
): Promise<string> {
    const json = JSON.stringify(output);
    if (process.platform === "win32") {
        const overridePath = path.join(dir, `${baseName}.cmd`);
        await writeFile(overridePath, `@echo off\r\necho ${json}\r\n`);
        return overridePath;
    }
    const overridePath = path.join(dir, baseName);
    await writeFile(overridePath, `#!/usr/bin/env bash\necho '${json}'`, {
        mode: 0o777,
    });
    return overridePath;
}

// A CliWrapper whose bundled CLI path points nowhere, so a version read fails.
function createCliWrapperWithMissingCli() {
    return new CliWrapper(
        {
            asAbsolutePath(relativePath: string) {
                return path.join(__dirname, "nonexistent", relativePath);
            },
        } as any,
        instance(mock(LoggerManager))
    );
}

// Restores EXTENSION_DEVELOPMENT after each test in the enclosing describe, so a
// suite that toggles the dev flag can't leak it into the rest of the run.
function restoreDevFlagAfterEach() {
    const original = process.env[EXTENSION_DEVELOPMENT];
    afterEach(() => {
        if (original === undefined) {
            delete process.env[EXTENSION_DEVELOPMENT];
        } else {
            process.env[EXTENSION_DEVELOPMENT] = original;
        }
    });
}

describe(__filename, function () {
    this.timeout("10s");

    it("should embed a working databricks CLI", async () => {
        const result = await execFile(cliPath, ["--help"]);
        assert.ok(result.stdout.indexOf("databricks") > 0);
    });

    it("should respect the CLI override setting", () => {
        const overridePath = "/path/to/my/cli/override";
        const configsSpy = spy(workspaceConfigs);
        mocks.push(configsSpy);
        when(configsSpy.databricksCliPath).thenReturn(overridePath);
        const cli = createCliWrapper();
        assert.strictEqual(cli.cliPath, overridePath);
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

    it("parseAiToolsInstallOutput parses the install result shapes", () => {
        // Success: every agent installed, no error fields.
        assert.deepStrictEqual(
            parseAiToolsInstallOutput(
                '{"scope":"global","agents":[{"name":"claude-code","delivery":"plugin","status":"installed"}]}'
            ),
            {
                scope: "global",
                agents: [
                    {
                        name: "claude-code",
                        delivery: "plugin",
                        status: "installed",
                    },
                ],
            }
        );

        // Per-agent failure carries a category and a (local-only) message.
        const skip = parseAiToolsInstallOutput(
            '{"scope":"project","agents":[{"name":"codex","delivery":"skip","status":"skipped","error_category":"UNSUPPORTED_SCOPE","message":"user-only"}]}'
        );
        assert.strictEqual(skip?.agents[0].error_category, "UNSUPPORTED_SCOPE");

        // Top-level failure: empty agents plus error/error_category.
        const topLevel = parseAiToolsInstallOutput(
            '{"scope":"global","agents":[],"error":"skill not found","error_category":"SKILL_NOT_FOUND"}'
        );
        assert.strictEqual(topLevel?.error_category, "SKILL_NOT_FOUND");

        // A top-level failure may omit `agents` entirely (Go's omitempty on a nil
        // slice); it is still a result, with agents defaulted to [].
        const noAgents = parseAiToolsInstallOutput(
            '{"scope":"global","error":"skill not found","error_category":"SKILL_NOT_FOUND"}'
        );
        assert.deepStrictEqual(noAgents?.agents, []);
        assert.strictEqual(noAgents?.error_category, "SKILL_NOT_FOUND");
    });

    it("parseAiToolsInstallOutput returns undefined for non-result output", () => {
        // A CLI old enough to ignore `--output json` prints human text.
        assert.strictEqual(
            parseAiToolsInstallOutput("Installed the plugin for 1 agent."),
            undefined
        );
        // Valid JSON that is neither an install result nor an error document.
        assert.strictEqual(
            parseAiToolsInstallOutput('{"release":"0.1.0"}'),
            undefined
        );
        assert.strictEqual(parseAiToolsInstallOutput(""), undefined);
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

    describe("parseCliVersion", () => {
        it("parses the fields from `databricks version --output json`", () => {
            assert.deepEqual(
                parseCliVersion(
                    /* eslint-disable @typescript-eslint/naming-convention */
                    JSON.stringify({
                        Version: "0.240.0",
                        Tag: "v0.240.0",
                        Major: 0,
                        Minor: 240,
                        Patch: 0,
                    })
                    /* eslint-enable @typescript-eslint/naming-convention */
                ),
                {
                    version: "0.240.0",
                    tag: "v0.240.0",
                    major: 0,
                    minor: 240,
                    patch: 0,
                }
            );
        });

        it("returns undefined when a field is missing", () => {
            assert.equal(parseCliVersion('{"Version": "0.240.0"}'), undefined);
            assert.equal(parseCliVersion('{"foo": "bar"}'), undefined);
        });

        it("returns undefined when a field has the wrong type", () => {
            assert.equal(
                parseCliVersion(
                    /* eslint-disable @typescript-eslint/naming-convention */
                    JSON.stringify({
                        Version: 240,
                        Tag: "v0.240.0",
                        Major: 0,
                        Minor: 240,
                        Patch: 0,
                    })
                    /* eslint-enable @typescript-eslint/naming-convention */
                ),
                undefined
            );
        });

        it("returns undefined on malformed JSON", () => {
            assert.equal(parseCliVersion("not json"), undefined);
            assert.equal(parseCliVersion(""), undefined);
        });
    });

    describe("getCliVersion", () => {
        it("returns undefined for a missing binary", async () => {
            assert.equal(
                await getCliVersion(
                    path.join(__dirname, "nonexistent-databricks")
                ),
                undefined
            );
        });

        // Smoke test: spawns the REAL bundled CLI that CI fetches at the pinned
        // version, so it validates the `package:cli:fetch` step. Cold-spawning a
        // ~50MB binary on the Windows runner can exceed the 2s mocha default.
        it("reports the pinned version of the bundled CLI", async function () {
            this.timeout(30_000);
            assert.equal(
                (await getCliVersion(cliPath))?.version,
                pinnedCliVersion
            );
        });
    });

    // checkBundledCliVersion paths that never launch the real bundled CLI —
    // they hit the dev-flag / unpinned gate, or fail fast on a missing binary —
    // so they stay fast in the unit suite.
    describe("checkBundledCliVersion gating", () => {
        restoreDevFlagAfterEach();

        it("does not warn outside a dev checkout (no CLI spawn)", async () => {
            delete process.env[EXTENSION_DEVELOPMENT];
            assert.ok(
                await createCliWrapper().checkBundledCliVersionForDev({
                    packageName: "databricks",
                    version: "2.13.0",
                    cliVersion: `${pinnedCliVersion}-not-the-bundled-version`,
                })
            );
        });

        it("does not warn when the pinned version is unknown", async () => {
            process.env[EXTENSION_DEVELOPMENT] = "true";
            assert.ok(
                await createCliWrapper().checkBundledCliVersionForDev({
                    packageName: "databricks",
                    version: "2.13.0",
                })
            );
        });

        it("does not warn when the CLI version can't be read but a version is pinned", async () => {
            // Dev checkout with a pinned version, but the CLI is unreadable —
            // the actual version is unknown, so we must not warn (nor throw).
            process.env[EXTENSION_DEVELOPMENT] = "true";
            assert.ok(
                await createCliWrapperWithMissingCli().checkBundledCliVersionForDev(
                    {
                        packageName: "databricks",
                        version: "2.13.0",
                        cliVersion: "0.240.0",
                    }
                )
            );
        });
    });

    // Smoke tests: these spawn the REAL bundled CLI that CI fetches at the
    // pinned version, so they validate the `package:cli:fetch` step, not unit
    // logic (the version parsing is unit-tested above). Cold-spawning a
    // ~50MB binary on the Windows runner exceeds the 2s mocha default, so give
    // the suite a generous timeout — the default made this flake intermittently.
    describe("checkBundledCliVersion (smoke — spawns the real fetched binary)", function () {
        this.timeout(30_000);

        restoreDevFlagAfterEach();
        beforeEach(() => {
            process.env[EXTENSION_DEVELOPMENT] = "true";
        });

        it("is accepted as matching the pinned version", async () => {
            assert.ok(
                await createCliWrapper().checkBundledCliVersionForDev({
                    packageName: "databricks",
                    version: "2.13.0",
                    cliVersion: pinnedCliVersion,
                })
            );
        });

        it("is flagged as stale against a different pinned version", async () => {
            assert.ok(
                !(await createCliWrapper().checkBundledCliVersionForDev({
                    packageName: "databricks",
                    version: "2.13.0",
                    cliVersion: `${pinnedCliVersion}-not-the-bundled-version`,
                }))
            );
        });
    });

    describe("warnOverridenCliDrift", function () {
        /* eslint-disable @typescript-eslint/naming-convention */
        let bundledVersion: {
            Major: number;
            Minor: number;
            Patch: number;
            Version: string;
        };
        /* eslint-enable @typescript-eslint/naming-convention */
        let tmpDir: string;

        before(async () => {
            const {stdout} = await execFile(createCliWrapper().cliPath, [
                "version",
                "--output",
                "json",
            ]);
            bundledVersion = JSON.parse(stdout);
            tmpDir = await mkdtemp(path.join(os.tmpdir(), "aitools-cli-"));
        });

        after(async () => {
            await rm(tmpDir, {recursive: true, force: true});
        });

        const cases = [
            {major: 0, minor: 0, patch: 0, warning: false},
            {major: 0, minor: 0, patch: 1, warning: false},
            {major: 0, minor: 0, patch: -1, warning: true},
            {major: 0, minor: 1, patch: 0, warning: false},
            {major: 0, minor: 1, patch: 1, warning: false},
            {major: 0, minor: 1, patch: -1, warning: false},
            {major: 0, minor: -1, patch: 0, warning: true},
            {major: 0, minor: -1, patch: 1, warning: true},
            {major: 0, minor: -1, patch: -1, warning: true},
            {major: 1, minor: 0, patch: 0, warning: false},
            {major: 1, minor: 0, patch: 1, warning: false},
            {major: 1, minor: 0, patch: -1, warning: false},
            {major: 1, minor: 1, patch: 0, warning: false},
            {major: 1, minor: 1, patch: 1, warning: false},
            {major: 1, minor: 1, patch: -1, warning: false},
            {major: 1, minor: -1, patch: 0, warning: false},
            {major: 1, minor: -1, patch: 1, warning: false},
            {major: 1, minor: -1, patch: -1, warning: false},
            {major: -1, minor: 0, patch: 0, warning: true},
            {major: -1, minor: 0, patch: 1, warning: true},
            {major: -1, minor: 0, patch: -1, warning: true},
            {major: -1, minor: 1, patch: 0, warning: true},
            {major: -1, minor: 1, patch: 1, warning: true},
            {major: -1, minor: 1, patch: -1, warning: true},
            {major: -1, minor: -1, patch: 0, warning: true},
            {major: -1, minor: -1, patch: 1, warning: true},
            {major: -1, minor: -1, patch: -1, warning: true},
        ];

        for (const c of cases) {
            const diff = (n: number) => (n === 0 ? "=" : n === 1 ? ">" : "<");
            const name =
                (c.warning
                    ? "should warn when the overriden CLI is out of date"
                    : "should not warn when the overriden CLI is up to date") +
                ` (${diff(c.major)}major, ${diff(c.minor)}minor, ${diff(
                    c.patch
                )}patch)`;
            it(name, async () => {
                const showWarningCalls: unknown[][] = [];
                const originalShowWarning = window.showWarningMessage;
                (window as any).showWarningMessage = async (
                    ...args: unknown[]
                ) => {
                    showWarningCalls.push(args);
                };
                try {
                    const major = bundledVersion.Major + c.major;
                    const minor = bundledVersion.Minor + c.minor;
                    const patch = bundledVersion.Patch + c.patch;
                    /* eslint-disable @typescript-eslint/naming-convention */
                    const overrideOutput = {
                        Version: `${major}.${minor}.${patch}`,
                        Tag: `v${major}.${minor}.${patch}`,
                        Major: major,
                        Minor: minor,
                        Patch: patch,
                    };
                    /* eslint-enable @typescript-eslint/naming-convention */
                    const overridePath = await writeFakeCli(
                        tmpDir,
                        `databricks-${overrideOutput.Tag}`,
                        overrideOutput
                    );

                    const configsSpy = spy(workspaceConfigs);
                    mocks.push(configsSpy);
                    when(configsSpy.databricksCliPath).thenReturn(overridePath);

                    const cli = createCliWrapper();
                    await cli.warnOverridenCliDrift(bundledVersion.Version);
                    if (c.warning) {
                        assert.equal(showWarningCalls.length, 1);
                        const warningMessage = showWarningCalls[0][0] as string;
                        assert.match(
                            warningMessage,
                            /Your overridden Databricks CLI is out of date/
                        );
                    } else {
                        assert.deepEqual(
                            showWarningCalls,
                            [],
                            "window.showWarningMessage should not have been called"
                        );
                    }
                } finally {
                    (window as any).showWarningMessage = originalShowWarning;
                }
            });
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

    // On a non-zero exit the thrown error must mirror Node's `execFile`
    // rejection: stderr in `.message` (the profile parser greps it) plus
    // numeric `.code` and `.stderr`/`.stdout` (what the SDK's `isFileNotFound`
    // inspects). Regression guard for the spawn-based reimplementation.
    it("throws a Node-execFile-shaped error on a non-zero exit", async () => {
        let caught: any;
        try {
            await cancellableExecFile(process.execPath, [
                "-e",
                "process.stderr.write('cannot parse config file'); process.stdout.write('partial'); process.exit(3);",
            ]);
        } catch (e) {
            caught = e;
        }
        assert.ok(caught, "expected a rejection on non-zero exit");
        assert.strictEqual(caught.code, 3);
        assert.strictEqual(caught.stderr, "cannot parse config file");
        assert.strictEqual(caught.stdout, "partial");
        assert.ok(
            caught.message.includes("cannot parse config file"),
            "stderr must be in the error message for the profile-parse checks"
        );
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
