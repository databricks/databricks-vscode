import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { DeployedBundle } from "../../kernel/bundle/BundleService";
import { CliError } from "../../kernel/cli/Cli";
import { MissingVariableError, summaryOutput } from "../../kernel/cli/commands/bundle";
import { registerFeatures, type Kernel } from "../../kernel/feature";
import { UserFacingError } from "../../platform/errors";
import { Resource } from "../../platform/reactive";
import { fakeFeatureHost, fakeLog } from "../../test-support/fakes";
import { host as vscode } from "../../test-support/vscode";
import {
    bundleCommandError,
    refreshRemoteState,
    REFRESH_REMOTE_STATE,
    SHOW_LOGS,
} from "./BundleExplorerCommands";
import { BundleExplorerTreeDataProvider } from "./BundleExplorerTreeDataProvider";
import { DEPLOY, DESTROY, FORCE_DEPLOY, FORCE_DESTROY } from "./BundleCommands";
import { bundleExplorer } from "./index";
import {
    CANCEL_RUN,
    CLEAR_PIPELINE_DIAGNOSTICS,
    DEPLOY_AND_RUN_FROM_INPUT,
    DEPLOY_AND_RUN_JOB,
    DEPLOY_AND_RUN_PIPELINE,
    DEPLOY_AND_RUN_SELECTED_TABLES,
    DEPLOY_AND_VALIDATE_PIPELINE,
    SHOW_PIPELINE_EVENT_DETAILS,
} from "./run/RunCommands";

const FIXTURES = path.join(
    __dirname,
    "..",
    "..",
    "kernel",
    "cli",
    "commands",
    "fixtures",
    "bundle",
);
const summary = (name: string) =>
    summaryOutput.parse(JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf-8")));

describe("the bundle explorer feature", () => {
    beforeEach(() => vscode.reset());

    it("registers refresh, show logs, deploy, destroy and the run commands, and no view of its own", () => {
        const [registered] = registerFeatures([bundleExplorer], fakeFeatureHost().host);
        expect(registered?.error).toBeUndefined();
        // Its rows are the Resources group of the Project view.
        expect(vscode.treeDataProviders.has("dabsResourceExplorerView")).toBe(false);
        expect(registered?.commandIds).toEqual([
            REFRESH_REMOTE_STATE,
            SHOW_LOGS,
            DEPLOY,
            FORCE_DEPLOY,
            DESTROY,
            FORCE_DESTROY,
            DEPLOY_AND_RUN_JOB,
            DEPLOY_AND_RUN_PIPELINE,
            DEPLOY_AND_VALIDATE_PIPELINE,
            DEPLOY_AND_RUN_SELECTED_TABLES,
            DEPLOY_AND_RUN_FROM_INPUT,
            CANCEL_RUN,
            CLEAR_PIPELINE_DIAGNOSTICS,
            SHOW_PIPELINE_EVENT_DETAILS,
        ]);
        expect(vscode.diagnostics.map((d) => d.name)).toEqual(["Databricks Pipelines"]);
    });

    it("refresh needs a project", async () => {
        registerFeatures([bundleExplorer], fakeFeatureHost().host);
        await vscode.commands.get(REFRESH_REMOTE_STATE)?.();
        expect(vscode.errors.map((e) => e.message)).toEqual(["Open a Databricks project first."]);
    });

    it("refresh clears the pipeline datasets before and after it pulls the state, even when the pull fails", async () => {
        const order: string[] = [];
        const kernel = {
            bundle: {
                refreshRemoteState: async () => {
                    order.push("refresh");
                    throw new Error("boom");
                },
            },
        } as unknown as Kernel;
        await expect(
            refreshRemoteState(kernel, { clear: () => order.push("clear") }),
        ).rejects.toThrow();
        expect(order).toEqual(["clear", "refresh", "clear"]);
    });

    it("shows the latest summary, keeps it while the next loads, and empties on reset", async () => {
        let next: DeployedBundle = {
            root: "/p",
            target: "dev",
            host: "https://h",
            summary: summary("job.dev_test.summary.json"),
        };
        const deployed = new Resource(async () => next);
        const provider = new BundleExplorerTreeDataProvider(deployed, (p) => p, fakeLog());
        let refreshes = 0;
        provider.onDidChangeTreeData(() => refreshes++);
        expect(await provider.getChildren()).toEqual([]);

        deployed.invalidate("test");
        await deployed.settled();
        expect(refreshes).toBe(1);
        const labels = async () => (await provider.getChildren()).map((n) => n.getTreeItem().label);
        expect(await labels()).toEqual(["Jobs"]);

        next = { ...next, summary: summary("empty.dev_test.summary.json") };
        deployed.invalidate("test");
        expect(await labels()).toEqual(["Jobs"]);
        await deployed.settled();
        expect(await labels()).toEqual([]);

        deployed.invalidate("test");
        await deployed.settled();
        deployed.reset();
        expect(await labels()).toEqual([]);
        provider.dispose();
    });

    it("words CLI failures as the old extension did, pointing at the bundle log", async () => {
        const cli = new CliError(["bundle", "summary"], 1, "Error: boom", "");
        const failed = bundleCommandError("Error refreshing remote state.", cli);
        expect(failed).toBeInstanceOf(UserFacingError);
        expect((failed as UserFacingError).userMessage).toBe(
            "Error refreshing remote state. Error executing Databricks CLI command.",
        );
        expect((failed as UserFacingError).actions.map((a) => a.title)).toEqual(["Show Logs"]);

        const missing = bundleCommandError(
            "Error refreshing remote state.",
            new MissingVariableError(cli),
        );
        expect((missing as UserFacingError).userMessage).toBe(
            "Error refreshing remote state. No value assigned to required variables.",
        );
        expect((missing as UserFacingError).actions.map((a) => a.title)).toEqual(["Assign Values"]);

        // "Assign Values" shows the log and the view, then opens the variables file.
        vscode.executed.length = 0;
        await (missing as UserFacingError).actions[0]!.run();
        expect(vscode.executed.map((e) => e.command)).toEqual([
            "databricks.bundle.showLogs",
            "configurationView.focus",
            "databricks.bundle.variable.openFile",
        ]);

        const other = new Error("x");
        expect(bundleCommandError("p", other)).toBe(other);
    });
});
