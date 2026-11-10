import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import type { CustomTreeSection, TextEditor, Workbench } from "wdio-vscode-service";
import {
    getBasicBundleConfig,
    getUniqueResourceName,
    writeRootBundleConfig,
} from "./utils/bundle-fixtures.ts";
import { getActionButton, waitForLogin } from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { getViewSection, VARIABLES, waitForGroup } from "./utils/view.ts";

/*
 * Ported from the frozen suite. The imports differ, the bundle is typed as a
 * plain object (the fixtures don't have the generated `BundleSchema`), and
 * the DATABRICKS_HOST precondition is dropped: this harness doesn't set it,
 * and the fixtures take the host from the [DEFAULT] profile.
 * The editor tab is also found by its title without ".json", and the edit
 * checks that it lands in the variables file.
 */
type BundleSchema = ReturnType<typeof getBasicBundleConfig> & {
    targets?: Record<string, { variables?: Record<string, unknown> }>;
};

describe("Bundle Variables", async function () {
    let workbench: Workbench;
    let vscodeWorkspaceRoot: string;
    let schemaDef: BundleSchema;

    this.timeout(3 * 60 * 1000);

    async function createProjectWithJob() {
        const projectName = getUniqueResourceName("bundle_variables");
        /* eslint-disable @typescript-eslint/naming-convention */
        schemaDef = getBasicBundleConfig({
            bundle: {
                name: projectName,
                deployment: {},
            },
            variables: {
                varWithDefault: {
                    default: "default",
                },
                complexVar: {
                    type: "complex",
                    default: {
                        key1: "value1",
                        key2: 123,
                    },
                },
            },
            targets: {
                dev_test: {
                    variables: {
                        varWithDefault: "dev",
                    },
                },
            },
        });

        /* eslint-enable @typescript-eslint/naming-convention */
        await writeRootBundleConfig(schemaDef, vscodeWorkspaceRoot);
    }

    before(async function () {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH env var doesn't exist");

        workbench = await browser.getWorkbench();
        vscodeWorkspaceRoot = process.env.WORKSPACE_PATH;
        await createProjectWithJob();
        // The target's folder exists before the extension starts watching: a folder
        // created mid-session can be missed by the Linux watcher.
        fs.mkdirSync(path.join(vscodeWorkspaceRoot, ".databricks", "bundle", "dev_test"), {
            recursive: true,
        });
        await dismissNotifications();
    });

    it("should wait for extension activation", async () => {
        const section = await getViewSection("PROJECT");
        assert(section);
    });

    it("should wait for connection", async () => {
        await waitForLogin("DEFAULT");
        await dismissNotifications();
    });

    /** The Variables group's inline "Reset" button; the buttons show on hover. */
    async function resetAction(section: CustomTreeSection) {
        for (const item of await section.getVisibleItems()) {
            if ((await item.getLabel()) === VARIABLES) {
                await item.elem.moveTo();
                return getActionButton(item, "Reset bundle variables to default values");
            }
        }
        return undefined;
    }

    /** The variable's row in the Variables group, which opens the group. */
    async function variableRow(section: CustomTreeSection, variableName: string) {
        for (const row of await section.openItem(VARIABLES)) {
            if ((await row.getLabel()) === variableName) {
                return row;
            }
        }
        return undefined;
    }

    async function assertVariableValue(
        section: CustomTreeSection,
        variableName: string,
        expected: { value?: string; defaultValue?: string },
    ) {
        await section.expand();
        const variableTreeItem = await variableRow(section, variableName);
        assert(variableTreeItem);
        assert.strictEqual(await variableTreeItem.getDescription(), expected.value);

        if (expected.defaultValue) {
            const defaultValueTreeItem = (await section.openItem(VARIABLES, variableName))[0];
            assert(defaultValueTreeItem);
            assert.strictEqual(await defaultValueTreeItem.getLabel(), "Default");
            assert.strictEqual(await defaultValueTreeItem.getDescription(), expected.defaultValue);
        }
    }

    it("should find the bundle variables in the Project view and load default values", async function () {
        const section = (await getViewSection("PROJECT")) as CustomTreeSection | undefined;
        assert(section);
        await waitForGroup(section, VARIABLES, 20_000);

        await assertVariableValue(section, "varWithDefault", {
            value: "dev",
            defaultValue: "default",
        });
        await assertVariableValue(section, "complexVar", {
            value: `{"key1":"value1","key2":123}`,
            defaultValue: `{"key1":"value1","key2":123}`,
        });
    });

    it("should override default variable", async function () {
        // Drain notifications so a toast can't steal focus while the editor opens.
        await dismissNotifications();
        // Await the command so the open request is issued before we look for the
        // tab (the arrow fn must RETURN the Thenable).
        await browser.executeWorkbench((vscode) =>
            vscode.commands.executeCommand("databricks.bundle.variable.openFile"),
        );
        // openEditor enumerates the open tabs once and throws if the tab isn't
        // there yet; on the slower Windows shard the just-opened tab hasn't
        // rendered when we first look. Retry until it appears (re-fetching each
        // pass — do NOT cache the throwing result), failing closed if it never
        // opens so a genuinely broken command can't pass silently.
        let editor: TextEditor | undefined;
        await browser.waitUntil(
            async () => {
                // VS Code 1.140 renders ".json" in a separate suffix span,
                // so the page object reads the tab's title without it.
                for (const title of ["vscode.bundlevars.json", "vscode.bundlevars"]) {
                    try {
                        editor = (await workbench.getEditorView().openEditor(title)) as TextEditor;
                        return editor !== undefined;
                    } catch {
                        // Try the next title.
                    }
                }
                return false;
            },
            {
                timeout: 10_000,
                interval: 500,
                timeoutMsg: "vscode.bundlevars.json editor did not open within 10s",
            },
        );
        assert(editor);

        // Edit and save through the document API, as a user saving the editor
        // would. `TextEditor.setText()` round-trips the value through the
        // system clipboard, which fails intermittently under the headless Xvfb
        // display used in CI ("An error occurred while copying").
        const overrideContent = JSON.stringify({ varWithDefault: "new value" }, null, 4);
        const saveResult = await browser.executeWorkbench(async (vscode, content) => {
            const document = vscode.window.activeTextEditor?.document;
            if (!document) {
                return "no active editor";
            }
            if (!document.fileName.endsWith("vscode.bundlevars.json")) {
                return `the active editor is ${document.fileName}`;
            }
            const edit = new vscode.WorkspaceEdit();
            edit.replace(
                document.uri,
                new vscode.Range(
                    document.positionAt(0),
                    document.positionAt(document.getText().length),
                ),
                content,
            );
            await vscode.workspace.applyEdit(edit);
            // save() also returns false when there is nothing to save, so
            // report an edit that left the file unchanged separately.
            if (!document.isDirty) {
                return "override content matches the file";
            }
            return (await document.save()) ? "saved" : "save failed";
        }, overrideContent);
        assert.strictEqual(saveResult, "saved", "Could not save the vscode.bundlevars.json editor");

        const section = (await getViewSection("PROJECT")) as CustomTreeSection | undefined;
        assert(section);
        await waitForGroup(section, VARIABLES, 5_000);

        await browser.waitUntil(
            async () => {
                try {
                    await assertVariableValue(section, "varWithDefault", {
                        value: "new value",
                        defaultValue: "default",
                    });
                    return true;
                } catch {
                    return false;
                }
            },
            {
                timeout: 30_000,
                interval: 2_000,
                timeoutMsg: "Variable value not updated",
            },
        );
    });

    it("should revert overrides", async function () {
        const section = (await getViewSection("PROJECT")) as CustomTreeSection | undefined;
        assert(section);
        await waitForGroup(section, VARIABLES, 5_000);

        const action = await resetAction(section);

        assert(action);
        await action.click();

        await browser.waitUntil(
            async () => {
                try {
                    await assertVariableValue(section, "varWithDefault", {
                        value: "dev",
                        defaultValue: "default",
                    });
                    return true;
                } catch {
                    // The tree reverts off the extension's FileSystemWatcher,
                    // which can lag the reset on a slow/busy shard. Re-trigger
                    // the "Reset bundle variables to default values" action
                    // (re-fetched, since the element can go stale across tree
                    // refreshes), then let the next poll re-check. Resetting
                    // when already-default is a harmless no-op.
                    const reset = await resetAction(section);
                    if (reset) {
                        await reset.click();
                    }
                    return false;
                }
            },
            {
                timeout: 30_000,
                interval: 2_000,
                timeoutMsg: "Variable value not updated",
            },
        );
    });

    it("should list an override of a variable the bundle doesn't declare", async function () {
        const overridesFile = path.join(
            vscodeWorkspaceRoot,
            ".databricks",
            "bundle",
            "dev_test",
            "vscode.bundlevars.json",
        );
        fs.writeFileSync(overridesFile, JSON.stringify({ undeclaredVar: "from file" }));
        try {
            const section = (await getViewSection("PROJECT")) as CustomTreeSection | undefined;
            assert(section);
            await waitForGroup(section, VARIABLES, 5_000);

            await browser.waitUntil(
                async () => {
                    try {
                        await section.expand();
                        const item = await variableRow(section, "undeclaredVar");
                        assert(item);
                        assert.strictEqual(
                            await item.getDescription(),
                            "from file (not in the bundle)",
                        );
                        return true;
                    } catch {
                        return false;
                    }
                },
                {
                    timeout: 30_000,
                    interval: 2_000,
                    timeoutMsg: "The undeclared override isn't listed",
                },
            );
        } finally {
            fs.rmSync(overridesFile, { force: true });
        }
    });

    it("should update view if bundle changes", async function () {
        schemaDef.targets!["dev_test"].variables!["varWithDefault"] = "changed value in bundle";

        await writeRootBundleConfig(schemaDef, vscodeWorkspaceRoot);

        const section = (await getViewSection("PROJECT")) as CustomTreeSection | undefined;
        assert(section);
        await waitForGroup(section, VARIABLES, 5_000);

        await browser.waitUntil(
            async () => {
                await assertVariableValue(section, "varWithDefault", {
                    value: "changed value in bundle",
                    defaultValue: "default",
                });
                return true;
            },
            {
                timeout: 10_000,
                interval: 2_000,
                timeoutMsg: "Variable value not updated",
            },
        );
    });
});
