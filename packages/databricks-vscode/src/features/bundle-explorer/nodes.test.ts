import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { summaryOutput } from "../../kernel/cli/commands/bundle";
import {
    explorerRoots,
    humaniseResourceType,
    type ExplorerContext,
    type ExplorerNode,
} from "./nodes";

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

const ctx = (locations?: ExplorerContext["locations"]): ExplorerContext => ({
    host: "https://mock.databricks.test/",
    root: "/project",
    locations,
    asAbsolutePath: (p) => `/extension/${p}`,
});

/** Without a datasets context, every row lists its children synchronously. */
const kids = (n: ExplorerNode) => n.getChildren() as ExplorerNode[];

/** The tree as nested labels, with descriptions where rows have them. */
function render(nodes: ExplorerNode[]): unknown[] {
    return nodes.map((n) => {
        const item = n.getTreeItem();
        const label = typeof item.label === "string" ? item.label : item.label?.label;
        const text = item.description ? `${label} (${String(item.description)})` : label;
        const children = kids(n);
        return children.length > 0 ? { [text!]: render(children) } : text;
    });
}

describe("the bundle resource explorer's rows", () => {
    it("has no rows at all for an empty bundle", () => {
        const s = summary("empty.dev_test.summary.json");
        expect(explorerRoots(s, ctx(s.__locations))).toEqual([]);
    });

    it("shows Jobs › job › Tasks › tasks, with the task types", () => {
        const s = summary("job.dev_test.summary.json");
        expect(render(explorerRoots(s, ctx(s.__locations)))).toEqual([
            {
                Jobs: [
                    {
                        "[dev e2e] integration_job": [
                            { Tasks: ["notebook_task (Notebook)", "python_task (Spark Python)"] },
                        ],
                    },
                ],
            },
        ]);
    });

    it("gives an undeployed job its context, decoration and source location, and no link", () => {
        const s = summary("job.dev_test.summary.json");
        const job = kids(explorerRoots(s, ctx(s.__locations))[0]!)[0]!;
        const item = job.getTreeItem();
        expect(item.contextValue).toBe(
            "databricks.bundle.resource=jobs.runnable.has-source-location.nodeType=jobs",
        );
        expect(JSON.parse(item.resourceUri!.query)).toMatchObject({
            badge: "C",
            tooltip: "Created after deploy",
        });
        expect(job.url).toBeUndefined();
        expect(job.sourceLocation?.uri.fsPath).toBe(path.join("/project", "databricks.yml"));
        expect(job.sourceLocation?.range.start).toEqual({ line: 11, character: 10 });
        const header = explorerRoots(s, ctx(s.__locations))[0]!.getTreeItem();
        expect(header.contextValue).toBe("jobs-header");
        expect((header.iconPath as { dark: { fsPath: string } }).dark.fsPath).toBe(
            "/extension/" + path.join("resources", "dark", "resource-explorer", "jobs.svg"),
        );
    });

    it("links a deployed job and its tasks into the workspace", () => {
        const s = summary("job.dev_test.summary.json");
        const jobs = s.resources!.jobs!;
        jobs.vscode_integration_test = {
            ...jobs.vscode_integration_test,
            id: "123",
            modified_status: undefined,
        };
        const job = kids(explorerRoots(s, ctx())[0]!)[0]!;
        expect(job.url).toBe("https://mock.databricks.test/#job/123");
        expect(job.getTreeItem().contextValue).toBe(
            "databricks.bundle.resource=jobs.runnable.has-url.nodeType=jobs",
        );
        expect(job.getTreeItem().resourceUri).toBeUndefined();
        const task = kids(kids(job)[0]!)[0]!;
        expect(task.url).toBe("https://mock.databricks.test/#job/123/tasks/task/notebook_task");
        expect(task.getTreeItem()).toMatchObject({
            tooltip: "Runs the notebook",
            contextValue: "databricks.bundle.has-url.nodeType=task",
        });
    });

    it("shows pipelines with their catalog and target, then other resource types", () => {
        const s = summary("pipeline.dev_test.summary.json");
        expect(render(explorerRoots(s, ctx(s.__locations)))).toEqual([
            {
                Pipelines: [
                    {
                        "[dev e2e] integration_pipeline": [
                            "Catalog (main)",
                            "Target (vscode_integration_test)",
                        ],
                    },
                ],
            },
            { Schemas: ["dev_e2e_my_schema"] },
        ]);
    });

    it("doesn't offer to run a resource deleted after deploy", () => {
        const s = summary("job.dev_test.summary.json");
        s.resources!.jobs!.vscode_integration_test!.modified_status = "deleted";
        const item = kids(explorerRoots(s, ctx())[0]!)[0]!.getTreeItem();
        expect(item.contextValue).toBe("databricks.bundle.resource=jobs.nodeType=jobs");
        expect(item.collapsibleState).toBe(0);
    });

    it("humanises resource types as the old explorer did", () => {
        expect(humaniseResourceType("jobs")).toBe("Jobs");
        expect(humaniseResourceType("model_serving_endpoints")).toBe("Model serving endpoints");
    });
});
