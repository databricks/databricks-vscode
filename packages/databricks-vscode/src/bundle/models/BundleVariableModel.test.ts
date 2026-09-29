import assert from "assert";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {Range, Uri, WorkspaceEdit, workspace} from "vscode";
import {ConfigModel} from "../../configuration/models/ConfigModel";
import {WorkspaceFolderManager} from "../../vscode-objs/WorkspaceFolderManager";
import {BundleValidateModel} from "./BundleValidateModel";
import {BundleVariableModel} from "./BundleVariableModel";

async function waitFor(predicate: () => Promise<boolean>, message: string) {
    for (let i = 0; i < 50; i++) {
        if (await predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.fail(message);
}

// The fake ConfigModel never fires onDidChangeTarget, so no file watcher is
// created: these tests cover only the refreshes that must not depend on one.
describe("BundleVariableModel", () => {
    let projectRoot: string;
    let overrideFile: string;
    let validateRefreshes: number;
    let model: BundleVariableModel;

    beforeEach(async () => {
        projectRoot = await fs.mkdtemp(
            path.join(os.tmpdir(), "bundle-variables-")
        );
        overrideFile = path.join(
            projectRoot,
            ".databricks",
            "bundle",
            "dev",
            "vscode.bundlevars.json"
        );
        validateRefreshes = 0;

        const noopEvent = () => ({dispose() {}});
        const fakeConfigModel = {
            target: "dev",
            onDidChangeKey: () => noopEvent,
            onDidChangeTarget: noopEvent,
            get: async (key: string) =>
                key === "preValidateConfig"
                    ? {
                          preValidateBundleSchema: {
                              variables: {foo: {default: "default"}},
                          },
                      }
                    : undefined,
        } as unknown as ConfigModel;
        const fakeBundleValidateModel = {
            refresh: async () => {
                validateRefreshes++;
            },
        } as unknown as BundleValidateModel;
        const fakeWorkspaceFolderManager = {
            activeProjectUri: Uri.file(projectRoot),
        } as unknown as WorkspaceFolderManager;

        model = new BundleVariableModel(
            fakeConfigModel,
            fakeBundleValidateModel,
            fakeWorkspaceFolderManager
        );
    });

    afterEach(async () => {
        model.dispose();
        await fs.rm(projectRoot, {recursive: true, force: true});
    });

    async function overrideOf(name: string) {
        return (await model.get("variables"))?.[name]?.vscodeOverrideValue;
    }

    // The model rewrites the override file whenever its variables change; wait
    // for that write so it can't land on top of the test's own changes.
    async function waitForOverrideFile(content: string) {
        await waitFor(
            async () =>
                (await fs.readFile(overrideFile, "utf8").catch(() => "")) ===
                content,
            `${overrideFile} never contained ${content}`
        );
    }

    it("picks up overrides saved from an editor", async () => {
        assert.strictEqual(await overrideOf("foo"), undefined);
        await waitForOverrideFile("{}");

        const document = await workspace.openTextDocument(
            Uri.file(overrideFile)
        );
        const edit = new WorkspaceEdit();
        edit.replace(
            document.uri,
            new Range(
                document.positionAt(0),
                document.positionAt(document.getText().length)
            ),
            JSON.stringify({foo: "override"})
        );
        await workspace.applyEdit(edit);
        assert(await document.save());

        await waitFor(
            async () => (await overrideOf("foo")) === "override",
            "saved override never reached the model"
        );
        assert.strictEqual(validateRefreshes, 1);
        await waitForOverrideFile(JSON.stringify({foo: "override"}, null, 4));
    });

    it("drops overrides once the override file is reset", async () => {
        await fs.mkdir(path.dirname(overrideFile), {recursive: true});
        await fs.writeFile(overrideFile, JSON.stringify({foo: "override"}));
        assert.strictEqual(await overrideOf("foo"), "override");
        await waitForOverrideFile(JSON.stringify({foo: "override"}, null, 4));

        await model.deleteBundleVariableFile();

        assert.strictEqual(await overrideOf("foo"), undefined);
        assert.strictEqual(validateRefreshes, 1);
        await waitForOverrideFile("{}");
    });
});
