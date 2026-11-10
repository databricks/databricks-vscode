import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isReauthRequiredError } from "../../../features/python/setup/uv/authErrors";
import * as acceptance from "../../../features/python/setup/uv/fixtures/setupLocalResults";
import {
    ERROR_NO_TARGET,
    ERROR_USAGE,
    SUCCESS_CONSTRAINTS_ONLY,
    SUCCESS_DEFAULT,
    SUCCESS_REAL_RUN,
    SUCCESS_WITH_WARNINGS,
} from "../../../features/python/setup/uv/fixtures/setupLocalResults";
import { isPythonSetupSuccess } from "../../../features/python/setup/uv/result";
import { CancelledError } from "../../../platform/errors";
import { fakeCli } from "../../../test-support/fakeCli";
import {
    environmentsSetupLocal,
    parseSetupLocalResult,
    SetupLocalParseError,
    setupLocalArgs,
    type SetupLocalInvocation,
} from "./environments";

/** Captured from CLI 1.19.0 against a mock workspace (`setup-local … --output json`). */
const FIXTURES = path.join(__dirname, "fixtures", "environments");
const fixture = (name: string) => fs.readFileSync(path.join(FIXTURES, name), "utf-8");

// The fixtures are typed PythonSetupResult objects; the parser takes raw CLI
// stdout, so serialize a fixture back to JSON to exercise the parse path.
const asStdout = (r: unknown) => JSON.stringify(r);

describe("setup-local golden outputs", () => {
    const outputs = fs.readdirSync(FIXTURES).filter((f) => f.endsWith(".json"));

    it("has the captured outputs", () => {
        expect(outputs).toEqual(
            expect.arrayContaining([
                "success.serverless.json",
                "rerun.serverless.json",
                "dry-run.serverless.json",
                "error.cluster.json",
                "error.usage.json",
                "error.version.json",
            ]),
        );
    });

    it.each(outputs)("parses %s from CLI 1.19.0", (file) => {
        const r = parseSetupLocalResult(fixture(file));
        expect(r.command).to.equal("environments setup-local");
        expect(r.schemaVersion).to.equal(1);
        expect(r.phases.map((p) => p.phase)).to.deep.equal([
            "preflight",
            "resolve",
            "fetch",
            "merge",
            "provision",
            "validate",
        ]);
        expect(Array.isArray(r.warnings)).to.equal(true);
        expect(r.ok).to.equal(r.error === null);
    });

    it("reads a real run: the relative venvPath, no backup, no plan", () => {
        const r = parseSetupLocalResult(fixture("success.serverless.json"));
        expect(r.ok).to.equal(true);
        expect(r.dryRun).to.equal(false);
        expect(r.venvPath).to.equal(".venv");
        expect(r.backupPath).to.equal(undefined);
        expect(r.plan).to.equal(undefined);
        expect(r.compute).to.deep.include({
            source: "serverless",
            serverlessVersion: "v4",
            envKey: "serverless/serverless-v4",
        });
        expect(r.compute?.clusterId).to.equal(undefined);
        expect(r.resolved?.pythonVersion).to.equal("3.12");
        expect(r.pythonResolution).to.equal("uv_install_succeeded");
        expect(r.error).to.equal(null);
    });

    it("reads a dry run's plan and no venvPath", () => {
        const r = parseSetupLocalResult(fixture("dry-run.serverless.json"));
        expect(r.dryRun).to.equal(true);
        expect(r.venvPath).to.equal(undefined);
        expect(r.plan?.wouldWrite).to.match(/pyproject\.toml$/);
        expect(r.compute?.envKey).to.equal("serverless/serverless-v4");
    });

    it("reads failures with and without a resolved compute", () => {
        const cluster = parseSetupLocalResult(fixture("error.cluster.json"));
        expect(cluster.error).to.deep.include({
            code: "E_RESOLVE",
            failurePhase: "resolve",
            diskMutated: false,
        });
        expect(cluster.compute).to.equal(undefined);
        const usage = parseSetupLocalResult(fixture("error.usage.json"));
        expect(usage.error?.code).to.equal("E_NO_TARGET");
        const version = parseSetupLocalResult(fixture("error.version.json"));
        expect(version.error?.code).to.equal("E_ENV_UNSUPPORTED");
        expect(version.compute?.envKey).to.equal("serverless/serverless-v9");
    });

    it.each(Object.entries(acceptance))(
        "round-trips the CLI acceptance fixture %s",
        (_name, value) => {
            expect(parseSetupLocalResult(asStdout(value))).to.deep.equal(value);
        },
    );

    it("reads null as absent for the optional fields", () => {
        const r = parseSetupLocalResult(
            asStdout({
                ...SUCCESS_REAL_RUN,
                venvPath: null,
                backupPath: null,
                plan: null,
                compute: null,
                resolved: null,
                pythonResolution: null,
            }),
        );
        for (const key of [
            "venvPath",
            "backupPath",
            "plan",
            "compute",
            "resolved",
            "pythonResolution",
        ] as const) {
            expect(r[key]).to.equal(undefined);
        }
    });

    it("reads a missing error as null", () => {
        const { error, ...withoutError } = SUCCESS_REAL_RUN;
        void error;
        expect(parseSetupLocalResult(asStdout(withoutError)).error).to.equal(null);
    });

    it("rejects an object that isn't a result", () => {
        expect(() => parseSetupLocalResult(asStdout({ ...SUCCESS_DEFAULT, ok: "yes" }))).to.throw(
            SetupLocalParseError,
        );
    });

    it("keeps fields a newer CLI adds", () => {
        const r = parseSetupLocalResult(asStdout({ ...SUCCESS_DEFAULT, newField: 1 }));
        expect((r as unknown as { newField: number }).newField).to.equal(1);
    });
});

describe("parseSetupLocalResult", () => {
    it("parses a successful default-mode dry-run result", () => {
        const r = parseSetupLocalResult(asStdout(SUCCESS_DEFAULT));
        expect(r.ok).to.equal(true);
        expect(r.command).to.equal("environments setup-local");
        expect(r.schemaVersion).to.equal(1);
        expect(r.mode).to.equal("default");
        expect(r.dryRun).to.equal(true);
        expect(r.compute?.serverlessVersion).to.equal("v4");
        expect(r.compute?.envKey).to.equal("serverless/serverless-v4");
        expect(r.resolved?.pythonVersion).to.equal("3.12");
        expect(r.resolved?.dbconnectVersion).to.equal("17.2.0");
        expect(r.error).to.equal(null);
        expect(r.phases).to.have.length(6);
        expect(r.phases[0]).to.deep.equal({ phase: "preflight", status: "ok" });
    });

    it("parses a constraints-only result with dbconnectVersion absent", () => {
        const r = parseSetupLocalResult(asStdout(SUCCESS_CONSTRAINTS_ONLY));
        expect(r.ok).to.equal(true);
        expect(r.mode).to.equal("constraints-only");
        expect(r.resolved?.pythonVersion).to.equal("3.12");
        expect(r.resolved?.dbconnectVersion).to.equal(undefined);
    });

    it("parses a real (non-dry-run) success with venvPath and backupPath", () => {
        const r = parseSetupLocalResult(asStdout(SUCCESS_REAL_RUN));
        expect(r.ok).to.equal(true);
        expect(r.dryRun).to.equal(false);
        expect(r.venvPath).to.equal(".venv");
        expect(r.backupPath).to.equal("/home/user/project/pyproject.toml.bak");
    });

    // Ported from the old extension (databricks/databricks-vscode#2253).
    it("parses the uv workspace fields of a workspace member run", () => {
        const r = parseSetupLocalResult(asStdout(acceptance.SUCCESS_REAL_RUN_UV_WORKSPACE_MEMBER));
        expect(r.venvPath).to.equal("../../.venv");
        expect(r.uvWorkspaceRoot).to.equal("/home/user/monorepo");
        expect(r.uvWorkspaceBackupPath).to.equal("/home/user/monorepo/pyproject.toml.bak");
    });

    it("parses an E_NO_TARGET failure and exposes the error object", () => {
        const r = parseSetupLocalResult(asStdout(ERROR_NO_TARGET));
        expect(r.ok).to.equal(false);
        expect(r.error?.code).to.equal("E_NO_TARGET");
        expect(r.error?.failurePhase).to.equal("resolve");
        expect(r.error?.diskMutated).to.equal(false);
        // Downstream phases are reported "pending" after a failure.
        const provision = r.phases.find((p) => p.phase === "provision");
        expect(provision?.status).to.equal("pending");
    });

    it("parses an E_USAGE preflight failure", () => {
        const r = parseSetupLocalResult(asStdout(ERROR_USAGE));
        expect(r.ok).to.equal(false);
        expect(r.error?.code).to.equal("E_USAGE");
        expect(r.error?.failurePhase).to.equal("preflight");
    });

    it("parses merge warnings, preserving codes and order (incl. repeats)", () => {
        const r = parseSetupLocalResult(asStdout(SUCCESS_WITH_WARNINGS));
        expect(r.ok).to.equal(true);
        expect(r.warnings.map((w) => w.code)).to.deep.equal([
            "W_REQUIRES_PYTHON_OVERRIDDEN",
            "W_DBCONNECT_PIN_OVERRIDDEN",
            "W_DBCONNECT_CONSOLIDATED",
            "W_USER_CONSTRAINT_CONFLICT",
            "W_USER_CONSTRAINT_CONFLICT",
        ]);
    });

    it("normalizes a missing `warnings` key to an empty array", () => {
        // An older/variant CLI that omits `warnings` must not read as
        // undefined: the telemetry layer would then mis-record a real merge as
        // "no result produced" instead of a clean merge (warningsCount 0).
        const { warnings, ...withoutWarnings } = SUCCESS_REAL_RUN;
        void warnings;
        const r = parseSetupLocalResult(asStdout(withoutWarnings));
        expect(r.warnings).to.deep.equal([]);
    });

    it("normalizes a null `warnings` value to an empty array", () => {
        const r = parseSetupLocalResult(asStdout({ ...SUCCESS_REAL_RUN, warnings: null }));
        expect(r.warnings).to.deep.equal([]);
    });

    it("throws SetupLocalParseError on non-JSON stdout", () => {
        expect(() => parseSetupLocalResult("not json {")).to.throw(SetupLocalParseError);
    });

    it("throws SetupLocalParseError when the object lacks `ok`", () => {
        expect(() => parseSetupLocalResult('{"mode":"default"}')).to.throw(SetupLocalParseError);
    });

    it("throws SetupLocalParseError on empty stdout", () => {
        expect(() => parseSetupLocalResult("")).to.throw(SetupLocalParseError);
    });
});

describe("isPythonSetupSuccess", () => {
    it("is true for an ok result", () => {
        expect(isPythonSetupSuccess(parseSetupLocalResult(asStdout(SUCCESS_DEFAULT)))).to.equal(
            true,
        );
    });

    it("is false for a failed result", () => {
        expect(isPythonSetupSuccess(parseSetupLocalResult(asStdout(ERROR_NO_TARGET)))).to.equal(
            false,
        );
    });
});

describe("setupLocalArgs", () => {
    it("builds a default serverless invocation with JSON output", () => {
        const inv: SetupLocalInvocation = {
            compute: { kind: "serverless", version: "5" },
        };
        expect(setupLocalArgs(inv)).to.deep.equal([
            "environments",
            "setup-local",
            "--serverless-version",
            "5",
            "--output",
            "json",
        ]);
    });

    it("uses --cluster-id for a cluster target", () => {
        const args = setupLocalArgs({
            compute: { kind: "cluster", clusterId: "0710-abc" },
        });
        const i = args.indexOf("--cluster-id");
        expect(i).to.be.greaterThan(-1);
        expect(args[i + 1]).to.equal("0710-abc");
        expect(args).to.not.include("--serverless-version");
    });

    it("adds --no-constraints when constraints are skipped", () => {
        const args = setupLocalArgs({
            skipConstraints: true,
            compute: { kind: "serverless", version: "5" },
        });
        expect(args).to.include("--no-constraints");
        expect(args).to.not.include("--no-dbconnect");
    });

    it("adds --no-dbconnect when databricks-connect is skipped", () => {
        const args = setupLocalArgs({
            skipDbconnect: true,
            compute: { kind: "serverless", version: "5" },
        });
        expect(args).to.include("--no-dbconnect");
        expect(args).to.not.include("--no-constraints");
    });

    it("adds both negative flags when both are skipped, --no-constraints first", () => {
        const args = setupLocalArgs({
            skipConstraints: true,
            skipDbconnect: true,
            compute: { kind: "serverless", version: "5" },
        });
        const c = args.indexOf("--no-constraints");
        const d = args.indexOf("--no-dbconnect");
        expect(c).to.be.greaterThan(-1);
        expect(d).to.be.greaterThan(-1);
        expect(c).to.be.lessThan(d);
    });

    it("emits no behavioral flags for the default (full) invocation", () => {
        const args = setupLocalArgs({
            compute: { kind: "serverless", version: "5" },
        });
        expect(args).to.not.include("--no-constraints");
        expect(args).to.not.include("--no-dbconnect");
    });

    it("never emits the deprecated --constraints-only flag", () => {
        const args = setupLocalArgs({
            skipConstraints: true,
            skipDbconnect: true,
            compute: { kind: "cluster", clusterId: "c" },
        });
        expect(args).to.not.include("--constraints-only");
    });

    it("never passes --profile (auth is forwarded via the environment)", () => {
        const args = setupLocalArgs({
            compute: { kind: "serverless", version: "5" },
        });
        expect(args).to.not.include("--profile");
    });

    it("passes the hidden --constraint-source-url when provided", () => {
        const args = setupLocalArgs({
            compute: { kind: "serverless", version: "5" },
            constraintSourceUrl: "http://localhost:8077",
        });
        const i = args.indexOf("--constraint-source-url");
        expect(i).to.be.greaterThan(-1);
        expect(args[i + 1]).to.equal("http://localhost:8077");
    });

    it("always ends with --output json", () => {
        const args = setupLocalArgs({
            skipConstraints: true,
            skipDbconnect: true,
            compute: { kind: "cluster", clusterId: "c" },
            constraintSourceUrl: "u",
        });
        expect(args.slice(-2)).to.deep.equal(["--output", "json"]);
    });

    it("adds --dry-run when the invocation is a dry run", () => {
        const args = setupLocalArgs({
            compute: { kind: "serverless", version: "5" },
            dryRun: true,
        });
        expect(args).to.include("--dry-run");
        // Still requests machine-readable output last.
        expect(args.slice(-2)).to.deep.equal(["--output", "json"]);
    });

    it("omits --dry-run by default", () => {
        const args = setupLocalArgs({
            compute: { kind: "serverless", version: "5" },
        });
        expect(args).to.not.include("--dry-run");
    });
});

const inv: SetupLocalInvocation = { compute: { kind: "serverless", version: "5" } };

/**
 * Ported from the old `PythonSetupCliClient.test.ts`. The process-level cases
 * (detached spawn, UTF-8 chunk decoding, the terminator, a spawn error) are
 * `platform/process.test.ts`'s now: the gateway runs through `Cli.exec`.
 */
describe("environmentsSetupLocal", () => {
    it("parses the JSON result from stdout on success", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["environments", "setup-local"], { stdout: JSON.stringify(SUCCESS_DEFAULT) });
        const result = await environmentsSetupLocal(cli, inv, { cwd: "/proj", env: {} });
        expect(result.ok).to.equal(true);
        expect(result.command).to.equal("environments setup-local");
    });

    it("returns the parsed failure result on a non-zero exit with JSON", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["environments", "setup-local"], {
            stdout: JSON.stringify(ERROR_NO_TARGET),
            exitCode: 1,
        });
        const result = await environmentsSetupLocal(cli, inv, { cwd: "/proj", env: {} });
        expect(result.ok).to.equal(false);
        expect(result.error?.code).to.equal("E_NO_TARGET");
    });

    it("runs the CLI with setup-local argv in the given cwd and env", async () => {
        const { cli, runner } = fakeCli(undefined, "/custom/databricks");
        runner.on(["environments", "setup-local"], { stdout: JSON.stringify(SUCCESS_DEFAULT) });
        const env = {
            DATABRICKS_HOST: "https://example.cloud.databricks.com",
            DATABRICKS_CONFIG_PROFILE: "my-profile",
            DATABRICKS_CONFIG_FILE: "/custom/.databrickscfg",
        };
        await environmentsSetupLocal(cli, inv, { cwd: "/my/project", env });
        const [call] = runner.calls;
        expect(call!.command).to.equal("/custom/databricks");
        expect(call!.args.slice(0, 4)).to.deep.equal([
            "environments",
            "setup-local",
            "--serverless-version",
            "5",
        ]);
        expect(call!.args.slice(-2)).to.deep.equal(["--output", "json"]);
        expect(call!.options.cwd).to.equal("/my/project");
        expect(call!.options.env).to.deep.equal(env);
    });

    it("forwards stderr to onStderr", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["environments", "setup-local"], (_args, options) => {
            options.onStderr?.("uv: resolving dependencies…\n");
            return {
                stdout: JSON.stringify(SUCCESS_DEFAULT),
                stderr: "uv: resolving dependencies…\n",
            };
        });
        const logs: string[] = [];
        await environmentsSetupLocal(cli, inv, {
            cwd: "/proj",
            env: {},
            onStderr: (t) => logs.push(t),
        });
        expect(logs.join("")).to.contain("resolving dependencies");
    });

    it("rejects with SetupLocalParseError, appending stderr, when stdout is not valid JSON", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["environments", "setup-local"], {
            stdout: "not json",
            stderr: "boom",
            exitCode: 1,
        });
        const error = await environmentsSetupLocal(cli, inv, { cwd: "/proj", env: {} }).catch(
            (e: unknown) => e,
        );
        expect(error).to.be.instanceOf(SetupLocalParseError);
        expect((error as Error).message).to.match(/valid JSON/i);
        expect((error as Error).message).to.contain("boom");
    });

    it("produces a rejection the reauth matcher recognizes (gateway stderr → reauth gate)", async () => {
        const authStderr =
            "Error: a new access token could not be retrieved because the " +
            "refresh token is invalid. To reauthenticate, run the following " +
            "command:\n  databricks auth login --profile dev\n";
        const { cli, runner } = fakeCli();
        runner.on(["environments", "setup-local"], { stdout: "", stderr: authStderr, exitCode: 1 });
        const error = await environmentsSetupLocal(cli, inv, { cwd: "/proj", env: {} }).catch(
            (e: unknown) => e,
        );
        expect(isReauthRequiredError((error as Error).message)).to.equal(true);
    });

    it("rejects with CancelledError when aborted", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["environments", "setup-local"], (_args, options) => ({
            cancelled: options.signal?.aborted === true,
            exitCode: null,
        }));
        const controller = new AbortController();
        controller.abort();
        const error = await environmentsSetupLocal(cli, inv, {
            cwd: "/proj",
            env: {},
            signal: controller.signal,
        }).catch((e: unknown) => e);
        expect(error).to.be.instanceOf(CancelledError);
        expect(runner.calls[0]!.options.signal?.aborted).to.equal(true);
    });

    it("rethrows anything but a CLI exit as it is", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["environments", "setup-local"], () => {
            throw new Error("ENOENT");
        });
        const error = await environmentsSetupLocal(cli, inv, { cwd: "/proj", env: {} }).catch(
            (e: unknown) => e,
        );
        expect((error as Error).message).to.contain("ENOENT");
        expect(error).not.to.be.instanceOf(SetupLocalParseError);
    });
});
