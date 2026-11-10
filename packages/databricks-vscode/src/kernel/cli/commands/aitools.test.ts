import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CancelledError } from "../../../platform/errors";
import { fakeCli } from "../../../test-support/fakeCli";
import { CliError } from "../Cli";
import {
    aiToolsInstall,
    aiToolsInstallArgs,
    aiToolsList,
    aiToolsUninstall,
    aiToolsUpdate,
    parseAiToolsInstallOutput,
} from "./aitools";

/** Captured from CLI 1.19.0 (`aitools list|install --output json`), with a temporary home folder. */
const FIXTURES = path.join(__dirname, "fixtures", "aitools");
const fixture = (name: string) => fs.readFileSync(path.join(FIXTURES, name), "utf-8");
const ctx = { env: {}, cwd: "/w" };

describe("aitools list", () => {
    it("parses the list with nothing installed", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["aitools", "list"], { stdout: fixture("list.not-installed.json") });
        const result = await aiToolsList(cli, ctx);
        expect(runner.argv).toEqual([["aitools", "list", "--output", "json"]]);
        expect(runner.calls[0]!.options.cwd).toBe("/w");
        expect(result.release).toBe("0.2.10");
        expect(result.skills.length).toBeGreaterThan(10);
        expect(result.skills.every((s) => Object.keys(s.installed).length === 0)).toBe(true);
        expect(result.agents.map((a) => a.name)).toContain("claude-code");
        expect(result.agents.find((a) => a.name === "cursor")).toMatchObject({
            managed: false,
            supports_project_scope: false,
        });
    });

    it("parses a project install", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["aitools", "list"], { stdout: fixture("list.project.json") });
        const result = await aiToolsList(cli, ctx);
        expect(result.skills[0]!.installed.project).toBe(result.skills[0]!.latest_version);
        expect(result.agents.find((a) => a.name === "goose")!.installed.project).toEqual({
            delivery: "skills",
            version: "0.2.10",
        });
    });

    it("accepts an older CLI's agent without supports_project_scope", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["aitools", "list"], {
            stdout: JSON.stringify({
                release: "0.1.0",
                skills: [],
                agents: [
                    { name: "a", display_name: "A", managed: true, detected: true, installed: {} },
                ],
            }),
        });
        expect((await aiToolsList(cli, ctx)).agents[0]!.supports_project_scope).toBeUndefined();
    });

    it("throws for output that isn't JSON, and for a failing exit", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["aitools", "list"], { stdout: "Databricks skills are not installed." });
        await expect(aiToolsList(cli, ctx)).rejects.toThrow(
            "Can't parse the output of databricks aitools list",
        );
        runner.on(["aitools", "list"], { exitCode: 1, stderr: "boom" });
        await expect(aiToolsList(cli, ctx)).rejects.toBeInstanceOf(CliError);
    });
});

describe("aitools install", () => {
    it("passes the scope and the agents", () => {
        expect(aiToolsInstallArgs("global", ["claude-code", "goose"])).toEqual([
            "aitools",
            "install",
            "--scope",
            "global",
            "--agents",
            "claude-code,goose",
            "--output",
            "json",
        ]);
    });

    it("returns the result of a success", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["aitools", "install"], { stdout: fixture("install.success.json") });
        const result = await aiToolsInstall(cli, "project", ["goose"], ctx);
        expect(result.error).toBeUndefined();
        expect(result.output).toEqual({
            scope: "project",
            agents: [{ name: "goose", delivery: "skills", status: "installed" }],
        });
    });

    it("returns the JSON of a failing exit with the error", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["aitools", "install"], { exitCode: 1, stdout: fixture("install.skipped.json") });
        const result = await aiToolsInstall(cli, "project", ["copilot"], ctx);
        expect(result.error).toBeInstanceOf(CliError);
        expect(result.output!.agents[0]).toMatchObject({
            name: "copilot",
            status: "skipped",
            error_category: "UNSUPPORTED_SCOPE",
        });
    });

    it("returns no result for a failure without JSON", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["aitools", "install"], {
            exitCode: 1,
            stderr: fixture("install.unknown-agent.stderr.txt"),
        });
        const result = await aiToolsInstall(cli, "project", ["bogus"], ctx);
        expect(result.output).toBeUndefined();
        expect(result.error!.message).toContain('unknown agent "bogus"');
    });

    it("throws when cancelled", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["aitools", "install"], { cancelled: true, exitCode: null });
        await expect(aiToolsInstall(cli, "global", ["goose"], ctx)).rejects.toBeInstanceOf(
            CancelledError,
        );
    });
});

describe("parseAiToolsInstallOutput", () => {
    it("reads a top-level error without agents (omitempty)", () => {
        expect(
            parseAiToolsInstallOutput(
                JSON.stringify({
                    scope: "global",
                    error: "no ref",
                    error_category: "REF_LOOKUP_FAILED",
                }),
            ),
        ).toEqual({
            scope: "global",
            agents: [],
            error: "no ref",
            error_category: "REF_LOOKUP_FAILED",
        });
    });

    it("ignores text, other JSON values, and objects that aren't a result", () => {
        expect(parseAiToolsInstallOutput("Installed 29 skills.")).toBeUndefined();
        expect(parseAiToolsInstallOutput("[]")).toBeUndefined();
        expect(parseAiToolsInstallOutput("null")).toBeUndefined();
        expect(parseAiToolsInstallOutput(JSON.stringify({ scope: "global" }))).toBeUndefined();
        expect(
            parseAiToolsInstallOutput(JSON.stringify({ agents: [{ name: 1 }] })),
        ).toBeUndefined();
    });
});

describe("aitools update and uninstall", () => {
    it("run for the scope", async () => {
        const { cli, runner } = fakeCli();
        await aiToolsUpdate(cli, "global", ctx);
        await aiToolsUninstall(cli, "project", ctx);
        expect(runner.argv).toEqual([
            ["aitools", "update", "--scope", "global"],
            ["aitools", "uninstall", "--scope", "project"],
        ]);
        // Nothing is ever fed to the CLI's prompts.
        expect(runner.calls.every((c) => c.options.closeStdin)).toBe(true);
    });

    it("throw for a failing exit", async () => {
        const { cli, runner } = fakeCli();
        runner.on(["aitools", "update"], { exitCode: 1, stderr: "offline" });
        await expect(aiToolsUpdate(cli, "global", ctx)).rejects.toThrow("offline");
    });
});
