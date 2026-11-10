import { describe, expect, it } from "vitest";
import { fakeCli, FakeProcessRunner } from "../../test-support/fakeCli";
import { fakeSettings } from "../../test-support/fakes";
import { useTempDirs } from "../../test-support/tempDir";
import {
    bundledCliMismatchWarning,
    bundledCliPath,
    overriddenCliDriftWarning,
    parseCliVersion,
    resolveCliPath,
} from "./CliPaths";
import { CliError } from "./Cli";
import { authLogin, authLoginArgs, authToken, LOGIN_TIMEOUT_SECONDS } from "./commands/auth";
import { configure } from "./commands/configure";
import { cliVersion } from "./commands/version";

const ctx = { env: { DATABRICKS_CONFIG_FILE: "/cfg" } };
const at = (p: string) => `/ext/${p.replace(/^\.\//, "")}`;

describe("CliPaths", () => {
    it("bundles databricks, and databricks.exe on Windows", () => {
        expect(bundledCliPath(at, "linux")).toBe("/ext/bin/databricks");
        expect(bundledCliPath(at, "win32")).toBe("/ext/bin/databricks.exe");
    });

    it("prefers databricks.overrideDatabricksCLIPath", () => {
        expect(
            resolveCliPath(
                fakeSettings({ "databricks.overrideDatabricksCLIPath": "/opt/databricks" }),
                at,
            ),
        ).toBe("/opt/databricks");
        expect(resolveCliPath(fakeSettings(), at)).toBe(bundledCliPath(at));
    });

    it("parses databricks version --output json", () => {
        expect(
            parseCliVersion('{"Version":"1.19.0","Tag":"v1.19.0","Major":1,"Minor":19,"Patch":0}'),
        ).toEqual({
            version: "1.19.0",
            tag: "v1.19.0",
            major: 1,
            minor: 19,
            patch: 0,
        });
        expect(parseCliVersion("not json")).toBeUndefined();
        expect(parseCliVersion('{"Version":"1.19.0"}')).toBeUndefined();
    });

    it("warns about an overridden CLI older than the bundled one", () => {
        const v = (major: number, minor: number, patch: number) => ({
            version: `${major}.${minor}.${patch}`,
            tag: `v${major}.${minor}.${patch}`,
            major,
            minor,
            patch,
        });
        expect(overriddenCliDriftWarning(v(1, 18, 9), "1.19.0")).toBe(
            "Your overridden Databricks CLI is out of date (v1.18.9). Please update to 1.19.0 or later, otherwise you may encounter errors with the Databricks extension.",
        );
        expect(overriddenCliDriftWarning(v(1, 19, 0), "1.19.0")).toBeUndefined();
        expect(overriddenCliDriftWarning(v(2, 0, 0), "1.19.0")).toBeUndefined();
        expect(overriddenCliDriftWarning(v(1, 0, 0), "not-a-version")).toBeUndefined();
    });

    it("warns in development when the bundled CLI isn't the pinned one", () => {
        expect(bundledCliMismatchWarning("1.18.0", "1.19.0")).toMatch(
            /is v1\.18\.0, but this checkout pins v1\.19\.0/,
        );
        expect(bundledCliMismatchWarning("1.19.0", "1.19.0")).toBeUndefined();
        expect(bundledCliMismatchWarning(undefined, "1.19.0")).toBeUndefined();
    });
});

describe("Cli", () => {
    it("runs the CLI with the call's env and closes stdin", async () => {
        const { cli, runner } = fakeCli();
        await cli.exec(["version"], { ...ctx, cwd: "/w" });
        expect(runner.calls[0]).toMatchObject({
            command: "/ext/bin/databricks",
            args: ["version"],
            options: { cwd: "/w", env: ctx.env, closeStdin: true },
        });
    });

    it("throws CliError with stderr on a non-zero exit", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["bundle"], { exitCode: 1, stderr: "Error: boom\n" });
        await expect(cli.exec(["bundle", "validate"], ctx)).rejects.toMatchObject({
            name: "CliError",
            message: "Error: boom",
            exitCode: 1,
        });
    });

    it("throws CancelledError when the run was cancelled", async () => {
        const { cli, runner } = fakeCli();
        runner.on([], { exitCode: null, cancelled: true });
        await expect(cli.exec(["auth", "login"], ctx)).rejects.toMatchObject({
            name: "CancelledError",
        });
    });
});

/** What spawn reports for a file it can't run. */
function enoent(file: string): NodeJS.ErrnoException {
    return Object.assign(new Error(`spawn ${file} ENOENT`), {
        code: "ENOENT",
        path: file,
        syscall: `spawn ${file}`,
    });
}

describe("a CLI that can't start", () => {
    const temp = useTempDirs();

    it("says the bundled CLI wasn't found, and to reinstall the extension", async () => {
        const { path: at } = temp();
        const missing = at("bin", "databricks");
        const { cli, runner } = fakeCli(new FakeProcessRunner(), missing);
        const error = enoent(missing);
        runner.on([], () => {
            throw error;
        });
        const thrown = await cli.exec(["version"], ctx).catch((e: unknown) => e);
        expect(thrown).toMatchObject({
            code: "CLI_NOT_FOUND",
            message: `The Databricks CLI wasn't found at ${missing}. Reinstall the extension.`,
        });
        expect((thrown as Error).cause).toBe(error);
    });

    it("says the override setting is wrong, and to fix it, when the override's file is missing", async () => {
        const { path: at } = temp();
        const missing = at("opt", "databricks");
        const { cli, runner } = fakeCli(new FakeProcessRunner(), missing, true);
        runner.on([], () => {
            throw enoent(missing);
        });
        await expect(cli.exec(["version"], ctx)).rejects.toMatchObject({
            code: "CLI_NOT_FOUND",
            message: `The Databricks CLI wasn't found at ${missing}. Fix the path in databricks.overrideDatabricksCLIPath.`,
        });
    });

    it("says so when a started process can't start", async () => {
        const { path: at } = temp();
        const missing = at("bin", "databricks");
        const { cli, runner } = fakeCli(new FakeProcessRunner(), missing);
        const handle = cli.start(["bundle", "sync", "--watch"], ctx);
        runner.started[0]!.fail(enoent(missing));
        await expect(handle.exited).rejects.toMatchObject({
            code: "CLI_NOT_FOUND",
            message: `The Databricks CLI wasn't found at ${missing}. Reinstall the extension.`,
        });
    });

    it("keeps ENOENT when the CLI's file is there, as for a missing working directory", async () => {
        const files = temp();
        const bin = files.write("bin/databricks");
        const { cli, runner } = fakeCli(new FakeProcessRunner(), bin);
        const error = enoent(bin);
        runner.on([], () => {
            throw error;
        });
        await expect(cli.exec(["version"], { ...ctx, cwd: files.path("gone") })).rejects.toBe(
            error,
        );
        runner.started.length = 0;
        const handle = cli.start(["bundle", "sync", "--watch"], ctx);
        runner.started[0]!.fail(error);
        await expect(handle.exited).rejects.toBe(error);
    });

    it("keeps other spawn errors as they are", async () => {
        const { path: at } = temp();
        const missing = at("bin", "databricks");
        const { cli, runner } = fakeCli(new FakeProcessRunner(), missing);
        const error = Object.assign(new Error(`spawn ${missing} EACCES`), { code: "EACCES" });
        runner.on([], () => {
            throw error;
        });
        await expect(cli.exec(["version"], ctx)).rejects.toBe(error);
    });
});

describe("auth login", () => {
    // Ported from DatabricksCliCheck.test.ts.
    it("passes --host when known, so a new profile doesn't fall back to login.databricks.com", () => {
        expect(authLoginArgs({ host: "https://customer.custom-host.com", profile: "dev" })).toEqual(
            [
                "auth",
                "login",
                "--host",
                "https://customer.custom-host.com",
                "--profile",
                "dev",
                "--timeout",
                `${LOGIN_TIMEOUT_SECONDS}s`,
            ],
        );
    });

    it("uses --host alone when there is no profile, without a trailing slash", () => {
        expect(authLoginArgs({ host: "https://test.cloud.databricks.com/" })).toEqual([
            "auth",
            "login",
            "--host",
            "https://test.cloud.databricks.com",
            "--timeout",
            `${LOGIN_TIMEOUT_SECONDS}s`,
        ]);
    });

    it("leaves out --host to sign in via login.databricks.com", () => {
        expect(authLoginArgs({ profile: "dev" })).toEqual([
            "auth",
            "login",
            "--profile",
            "dev",
            "--timeout",
            `${LOGIN_TIMEOUT_SECONDS}s`,
        ]);
    });

    it("names the manual command without --host when signing in via login.databricks.com", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["auth", "login"], { exitCode: 1, stderr: "context deadline exceeded" });
        const error = await authLogin(cli, { profile: "dev" }, ctx).catch((e: unknown) => e);
        expect((error as Error).message).toContain("`databricks auth login --profile dev`");
    });

    it("keeps the unified-host workspace ID on --host", () => {
        expect(
            authLoginArgs({
                host: "https://test.cloud.databricks.com",
                profile: "dev",
                workspaceId: "1234567890",
            }),
        ).toContain("https://test.cloud.databricks.com?w=1234567890");
    });

    it("names the manual command, host single-quoted, when login fails", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["auth", "login"], { exitCode: 1, stderr: "context deadline exceeded" });
        const error = await authLogin(
            cli,
            { host: "https://test.cloud.databricks.com", profile: "dev", workspaceId: "123" },
            ctx,
        ).catch((e: unknown) => e);
        expect(error).toMatchObject({ code: "LOGIN_FAILED" });
        expect((error as Error).message).toContain("context deadline exceeded");
        expect((error as Error).message).toContain(
            "databricks auth login --host 'https://test.cloud.databricks.com?w=123' --profile dev",
        );
    });
});

describe("auth token", () => {
    it("parses the token and its expiry", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["auth", "token"], {
            stdout: JSON.stringify({
                access_token: "t",
                token_type: "Bearer",
                expiry: "2026-10-03T16:22:54.575430141Z",
            }),
        });
        const token = await authToken(cli, "dev", ctx);
        expect(runner.argv[0]).toEqual(["auth", "token", "--profile", "dev"]);
        expect(token.value).toBe("t");
        expect(token.expiry.toISOString()).toBe("2026-10-03T16:22:54.575Z");
    });

    it("fails on output it can't read", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["auth", "token"], { stdout: "{}" });
        await expect(authToken(cli, "dev", ctx)).rejects.toThrow();
    });
});

describe("configure", () => {
    it("passes the token on stdin, never in argv", async () => {
        const { cli, runner } = fakeCli();
        await configure(
            cli,
            { host: "https://h", profile: "NEW_PROFILE", token: "dapi-secret" },
            ctx,
        );
        expect(runner.calls[0]!.args).toEqual([
            "configure",
            "--host",
            "https://h",
            "--profile",
            "NEW_PROFILE",
        ]);
        expect(runner.calls[0]!.options.input).toBe("dapi-secret\n");
        expect(runner.calls[0]!.args.join(" ")).not.toContain("dapi-secret");
    });

    it("surfaces the CLI's error", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["configure"], { exitCode: 1, stderr: "Error: invalid host" });
        await expect(
            configure(cli, { host: "x", profile: "p", token: "t" }, ctx),
        ).rejects.toBeInstanceOf(CliError);
    });
});

describe("version", () => {
    it("is undefined when the CLI can't run", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["version"], { exitCode: 127 });
        expect(await cliVersion(cli, ctx)).toBeUndefined();
    });
});
