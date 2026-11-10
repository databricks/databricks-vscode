import { beforeEach, describe, expect, it } from "vitest";
import { registerFeatures } from "../../kernel/feature";
import { COPY, GO_TO_DEFINITION, OPEN_EXTERNAL } from "../../platform/ui/treeCommands";
import { fakeFeatureHost } from "../../test-support/fakes";
import { Location, Position, Uri, host as vscode } from "../../test-support/vscode";
import { treeCommands } from "./index";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
    const fake = fakeFeatureHost();
    registerFeatures([treeCommands], fake.host);
    const run = (id: string, ...args: unknown[]) =>
        vscode.commands.get(id)!(...args) as Promise<unknown>;
    return { ...fake, run };
}

describe("the shared tree commands", () => {
    beforeEach(() => vscode.reset());

    it("opens a link and records its type", async () => {
        const { reporter, run } = setup();
        await run(OPEN_EXTERNAL, {
            url: "https://docs.databricks.com/dev-tools/vscode-ext/run",
            type: "run_files_guide",
        });
        expect(vscode.opened).toEqual(["https://docs.databricks.com/dev-tools/vscode-ext/run"]);
        expect(reporter.events.map((e) => [e.name, e.properties?.["event.type"]])).toContainEqual([
            "openResourceExternally",
            "run_files_guide",
        ]);
    });

    it("adds https to a bare host, and accepts a promised URL", async () => {
        const { run } = setup();
        await run(OPEN_EXTERNAL, { url: Promise.resolve("a.cloud.databricks.com/#job/1") });
        expect(vscode.opened).toEqual(["https://a.cloud.databricks.com/#job/1"]);
    });

    it("shows the old error when a link has no URL", async () => {
        const { run } = setup();
        await run(OPEN_EXTERNAL, {});
        await settle();
        expect(vscode.errors.map((e) => e.message)).toEqual([
            "Databricks: Can't open external link. No URL found.",
        ]);
    });

    it("copies copyText, else the row's description, else its label", async () => {
        const { run } = setup();
        await run(COPY, { copyText: "explicit" });
        expect(vscode.clipboard).toBe("explicit");
        await run(COPY, {
            getTreeItem: () => ({ label: "notebook_task", description: "Notebook" }),
        });
        expect(vscode.clipboard).toBe("Notebook");
        await run(COPY, { getTreeItem: () => ({ label: { label: "Jobs" } }) });
        expect(vscode.clipboard).toBe("Jobs");
        expect(vscode.infos.map((i) => i.message)).toEqual([
            "Copied to clipboard",
            "Copied to clipboard",
            "Copied to clipboard",
        ]);
    });

    it("opens a row's source location, and says when there is none", async () => {
        const { run } = setup();
        await run(GO_TO_DEFINITION, {
            sourceLocation: new Location(Uri.file("/p/databricks.yml"), new Position(11, 10)),
        });
        expect(vscode.shownDocuments).toEqual(["/p/databricks.yml"]);
        await run(GO_TO_DEFINITION, {});
        await settle();
        expect(vscode.errors.map((e) => e.message)).toEqual([
            "Databricks: Can't open source location. No URL found.",
        ]);
    });
});
