import assert from "node:assert";
import {
    dismissNotifications,
    getUniqueResourceName,
    getViewSection,
    waitForLogin,
    waitForTreeItems,
} from "./utils/commonUtils.ts";
import {CustomTreeSection, TextEditor, Workbench} from "wdio-vscode-service";
import {
    getBasicBundleConfig,
    writeRootBundleConfig,
} from "./utils/dabsFixtures.ts";
import {BundleSchema} from "../../bundle/types.ts";

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
        assert(
            process.env.WORKSPACE_PATH,
            "WORKSPACE_PATH env var doesn't exist"
        );
        assert(
            process.env.DATABRICKS_HOST,
            "DATABRICKS_HOST env var doesn't exist"
        );

        workbench = await browser.getWorkbench();
        vscodeWorkspaceRoot = process.env.WORKSPACE_PATH;
        await createProjectWithJob();
        await dismissNotifications();
    });

    it("should wait for extension activation", async () => {
        const section = await getViewSection("CONFIGURATION");
        assert(section);
    });

    it("should wait for connection", async () => {
        await waitForLogin("DEFAULT");
        await dismissNotifications();
    });

    async function assertVariableValue(
        section: CustomTreeSection,
        variableName: string,
        expected: {value?: string; defaultValue?: string}
    ) {
        await section.expand();
        const variableTreeItem = await section.findItem(variableName);
        assert(variableTreeItem);
        assert.strictEqual(
            await variableTreeItem.getDescription(),
            expected.value
        );

        if (expected.defaultValue) {
            const defaultValueTreeItem = (
                await section.openItem(variableName)
            )[0];
            assert(defaultValueTreeItem);
            assert.strictEqual(
                await defaultValueTreeItem.getLabel(),
                "Default"
            );
            assert.strictEqual(
                await defaultValueTreeItem.getDescription(),
                expected.defaultValue
            );
        }
    }

    it("should find bundle variable explorer and load default variables", async function () {
        const section = (await getViewSection("BUNDLE VARIABLES")) as
            | CustomTreeSection
            | undefined;
        assert(section);
        await waitForTreeItems(section, 20_000);

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
            vscode.commands.executeCommand(
                "databricks.bundle.variable.openFile"
            )
        );
        // openEditor enumerates the open tabs once and throws if the tab isn't
        // there yet; on the slower Windows shard the just-opened tab hasn't
        // rendered when we first look. Retry until it appears (re-fetching each
        // pass — do NOT cache the throwing result), failing closed if it never
        // opens so a genuinely broken command can't pass silently.
        let editor: TextEditor | undefined;
        await browser.waitUntil(
            async () => {
                try {
                    editor = (await workbench
                        .getEditorView()
                        .openEditor("vscode.bundlevars.json")) as TextEditor;
                    return editor !== undefined;
                } catch {
                    return false;
                }
            },
            {
                timeout: 10_000,
                interval: 500,
                timeoutMsg:
                    "vscode.bundlevars.json editor did not open within 10s",
            }
        );
        assert(editor);

        // Write the override file through the VS Code filesystem API rather
        // than the editor. `TextEditor.setText()` round-trips the value
        // through the system clipboard, which fails intermittently under the
        // headless Xvfb display used in CI ("An error occurred while
        // copying"). Writing via `vscode.workspace.fs` avoids the clipboard
        // and — unlike a raw Node `fs.writeFile` — is observed by the
        // extension's FileSystemWatcher on this file, so the Bundle Variables
        // tree refreshes just as it does on a manual editor save. See the same
        // rationale in wsfs_explorer.e2e.ts.
        const overrideContent = JSON.stringify(
            {varWithDefault: "new value"},
            null,
            4
        );
        const wrote = await browser.executeWorkbench(
            async (vscode, content) => {
                const uri = vscode.window.activeTextEditor?.document.uri;
                if (!uri) {
                    return false;
                }
                await vscode.workspace.fs.writeFile(
                    uri,
                    Buffer.from(content, "utf8")
                );
                return true;
            },
            overrideContent
        );
        assert(wrote, "Could not resolve the vscode.bundlevars.json editor");

        const section = (await getViewSection("BUNDLE VARIABLES")) as
            | CustomTreeSection
            | undefined;
        assert(section);
        await waitForTreeItems(section, 5_000);

        await browser.waitUntil(
            async () => {
                try {
                    await assertVariableValue(section, "varWithDefault", {
                        value: "new value",
                        defaultValue: "default",
                    });
                    return true;
                } catch {
                    // The tree updates off the extension's FileSystemWatcher,
                    // which can lag the write on a slow/busy shard. Re-issue the
                    // idempotent write to re-trigger the watcher, then let the
                    // next poll re-check. Content is deterministic, so rewriting
                    // is safe.
                    await browser.executeWorkbench(async (vscode, content) => {
                        const uri =
                            vscode.window.activeTextEditor?.document.uri;
                        if (uri) {
                            await vscode.workspace.fs.writeFile(
                                uri,
                                Buffer.from(content, "utf8")
                            );
                        }
                    }, overrideContent);
                    return false;
                }
            },
            {
                timeout: 30_000,
                interval: 2_000,
                timeoutMsg: "Variable value not updated",
            }
        );
    });

    it("should revert overrides", async function () {
        const section = (await getViewSection("BUNDLE VARIABLES")) as
            | CustomTreeSection
            | undefined;
        assert(section);
        await (await section.elem).click();

        await waitForTreeItems(section, 5_000);

        const action = await section.getAction(
            "Reset bundle variables to default values"
        );

        assert(action);
        await (await action.elem).click();

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
                    const resetAction = await section.getAction(
                        "Reset bundle variables to default values"
                    );
                    if (resetAction) {
                        await (await resetAction.elem).click();
                    }
                    return false;
                }
            },
            {
                timeout: 30_000,
                interval: 2_000,
                timeoutMsg: "Variable value not updated",
            }
        );
    });

    it("should update view if bundle changes", async function () {
        schemaDef.targets!["dev_test"].variables!["varWithDefault"] =
            "changed value in bundle";

        await writeRootBundleConfig(schemaDef, vscodeWorkspaceRoot);

        const section = (await getViewSection("BUNDLE VARIABLES")) as
            | CustomTreeSection
            | undefined;
        assert(section);
        await waitForTreeItems(section, 5_000);

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
            }
        );
    });
});
