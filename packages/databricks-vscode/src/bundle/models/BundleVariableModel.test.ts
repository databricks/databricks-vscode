import assert from "assert";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {anything, reset, spy, verify} from "ts-mockito";
import {Disposable, Range, Uri, WorkspaceEdit, window, workspace} from "vscode";
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
    let variableDefinitions: Record<string, object>;
    let validateError: Error | undefined;
    let readConfigError: Error | undefined;
    let validatedVariables: Record<string, {value: string}>;
    let validateRefreshes: number;
    let variablesChanges: number;
    let disposables: Disposable[];
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
        variableDefinitions = {foo: {default: "default"}};
        validateError = undefined;
        readConfigError = undefined;
        validatedVariables = {};
        validateRefreshes = 0;
        variablesChanges = 0;
        disposables = [];

        const noopEvent = () => ({dispose() {}});
        const fakeConfigModel = {
            target: "dev",
            onDidChangeKey: () => noopEvent,
            onDidChangeTarget: noopEvent,
            get: async (key: string) => {
                if (readConfigError) {
                    throw readConfigError;
                }
                switch (key) {
                    case "preValidateConfig":
                        return {
                            preValidateBundleSchema: {
                                variables: variableDefinitions,
                            },
                        };
                    case "validateConfig":
                        return {variables: validatedVariables};
                }
            },
        } as unknown as ConfigModel;
        // Stands in for `bundle validate`, which resolves the overrides.
        const fakeBundleValidateModel = {
            refresh: async () => {
                validateRefreshes++;
                if (validateError) {
                    throw validateError;
                }
                const overrides = JSON.parse(
                    await fs.readFile(overrideFile, "utf8").catch(() => "{}")
                );
                validatedVariables = Object.fromEntries(
                    Object.entries(overrides).map(([key, value]) => [
                        key,
                        {value: value as string},
                    ])
                );
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
        disposables.forEach((d) => d.dispose());
        model.dispose();
        await fs.rm(projectRoot, {recursive: true, force: true});
    });

    async function variable(name: string) {
        return (await model.get("variables"))?.[name];
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

    // The tree re-renders only on this event, so count it instead of relying
    // on model.get(), which recomputes a stale cache on its own.
    function countVariablesChanges() {
        disposables.push(
            model.onDidChangeKey("variables")(async () => {
                variablesChanges++;
            })
        );
    }

    async function saveDocument(file: string, content: string) {
        const document = await workspace.openTextDocument(Uri.file(file));
        const edit = new WorkspaceEdit();
        edit.replace(
            document.uri,
            new Range(
                document.positionAt(0),
                document.positionAt(document.getText().length)
            ),
            content
        );
        await workspace.applyEdit(edit);
        assert(await document.save());
    }

    it("picks up overrides saved from an editor", async () => {
        assert.strictEqual(
            (await variable("foo"))?.vscodeOverrideValue,
            undefined
        );
        await waitForOverrideFile("{}");
        countVariablesChanges();

        await saveDocument(overrideFile, JSON.stringify({foo: "override"}));

        await waitFor(
            async () => variablesChanges > 0,
            "saving the override never notified the tree"
        );
        const foo = await variable("foo");
        assert.strictEqual(foo?.vscodeOverrideValue, "override");
        // State is read after validate, so it sees the validated value.
        assert.strictEqual(foo?.valueInTarget, "override");
        assert.strictEqual(validateRefreshes, 1);
        await waitForOverrideFile(JSON.stringify({foo: "override"}, null, 4));
    });

    it("ignores saves of other files", async () => {
        await variable("foo");
        await waitForOverrideFile("{}");
        countVariablesChanges();
        const otherFile = path.join(projectRoot, "other.json");
        await fs.writeFile(otherFile, "{}");

        await saveDocument(otherFile, JSON.stringify({foo: "other"}));
        // Save events arrive in order, so once the override save is handled,
        // the other file's save has been too.
        await saveDocument(overrideFile, JSON.stringify({foo: "override"}));

        await waitFor(
            async () => variablesChanges > 0,
            "saving the override never notified the tree"
        );
        assert.strictEqual(validateRefreshes, 1);
    });

    it("drops overrides once the override file is reset", async () => {
        await fs.mkdir(path.dirname(overrideFile), {recursive: true});
        await fs.writeFile(overrideFile, JSON.stringify({foo: "override"}));
        assert.strictEqual(
            (await variable("foo"))?.vscodeOverrideValue,
            "override"
        );
        await waitForOverrideFile(JSON.stringify({foo: "override"}, null, 4));
        countVariablesChanges();

        await model.deleteBundleVariableFile();

        assert.strictEqual(variablesChanges, 1);
        assert.strictEqual(
            (await variable("foo"))?.vscodeOverrideValue,
            undefined
        );
        assert.strictEqual(validateRefreshes, 1);
        await waitForOverrideFile("{}");
    });

    describe("when refreshing fails after reset", () => {
        let windowSpy: typeof window;

        beforeEach(() => {
            windowSpy = spy(window);
        });

        afterEach(() => {
            reset(windowSpy);
        });

        // A required variable set only in the override file has no value once
        // the file is deleted, so `bundle validate` exits with an error.
        it("still drops the override without an error popup", async () => {
            variableDefinitions = {req: {description: "required, no default"}};
            await fs.mkdir(path.dirname(overrideFile), {recursive: true});
            await fs.writeFile(overrideFile, JSON.stringify({req: "x"}));
            assert.strictEqual(
                (await variable("req"))?.vscodeOverrideValue,
                "x"
            );
            await waitForOverrideFile(JSON.stringify({req: "x"}, null, 4));
            countVariablesChanges();
            validateError = new Error("");

            await model.deleteBundleVariableFile();

            verify(windowSpy.showErrorMessage(anything())).never();
            assert.strictEqual(variablesChanges, 1);
            assert.strictEqual(
                (await variable("req"))?.vscodeOverrideValue,
                undefined
            );
            assert.strictEqual(validateRefreshes, 1);
        });

        it("doesn't report a failed state read as a failed delete", async () => {
            await fs.mkdir(path.dirname(overrideFile), {recursive: true});
            await fs.writeFile(overrideFile, JSON.stringify({foo: "override"}));
            await variable("foo");
            await waitForOverrideFile(
                JSON.stringify({foo: "override"}, null, 4)
            );
            readConfigError = new Error("");

            await model.deleteBundleVariableFile();

            verify(windowSpy.showErrorMessage(anything())).never();
            await assert.rejects(fs.access(overrideFile));
        });
    });
});
