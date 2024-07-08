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
    let clusterId: string;
    let schemaDef: BundleSchema;

    this.timeout(3 * 60 * 1000);

    async function createProjectWithJob() {
        const projectName = getUniqueResourceName("bundle_variables");
        schemaDef = getBasicBundleConfig({
            bundle: {
                name: projectName,
                deployment: {},
            },
            variables: {
                varWithDefault: {
                    default: "default",
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
            process.env.TEST_DEFAULT_CLUSTER_ID,
            "TEST_DEFAULT_CLUSTER_ID env var doesn't exist"
        );
        assert(
            process.env.WORKSPACE_PATH,
            "WORKSPACE_PATH env var doesn't exist"
        );
        assert(
            process.env.DATABRICKS_HOST,
            "DATABRICKS_HOST env var doesn't exist"
        );

        clusterId = process.env.TEST_DEFAULT_CLUSTER_ID;
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
        expected: {value?: string; defaultValue?: string; lookup?: string}
    ) {
        await section.expand();
        const variableTreeItem = await section.findItem(variableName);
        assert(variableTreeItem);
        console.log(
            await variableTreeItem.getDescription(),
            expected.value,
            (await variableTreeItem.getDescription()) === expected.value
        );
        assert((await variableTreeItem.getDescription()) === expected.value);

        if (expected.defaultValue) {
            const defaultValueTreeItem = (
                await section.openItem(variableName)
            )[0];
            assert(defaultValueTreeItem);
            assert((await defaultValueTreeItem.getLabel()) === "Default");
            assert(
                (await defaultValueTreeItem.getDescription()) ===
                    expected.defaultValue
            );
        }
    }

    it("should find bundle variable explorer and load default variables", async function () {
        const section = (await getViewSection("BUNDLE VARIABLES VIEW")) as
            | CustomTreeSection
            | undefined;
        assert(section);
        await waitForTreeItems(section, 20_000);

        await assertVariableValue(section, "varWithDefault", {
            value: "dev",
            defaultValue: "default",
        });
    });

    it("should override default variable", async function () {
        await browser.executeWorkbench((vscode) => {
            vscode.commands.executeCommand(
                "databricks.bundle.variable.openFile"
            );
        });
        const editor = (await workbench
            .getEditorView()
            .openEditor("vscode.bundlevars.json")) as TextEditor;
        assert(editor);

        await editor.clearText();
        await editor.setText(
            JSON.stringify({varWithDefault: "new value"}, null, 4)
        );
        await editor.save();

        const section = (await getViewSection("BUNDLE VARIABLES VIEW")) as
            | CustomTreeSection
            | undefined;
        assert(section);
        await waitForTreeItems(section, 5_000);

        await browser.waitUntil(
            async () => {
                await assertVariableValue(section, "varWithDefault", {
                    value: "new value",
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

    it("should revert overrides", async function () {
        const section = (await getViewSection("BUNDLE VARIABLES VIEW")) as
            | CustomTreeSection
            | undefined;
        assert(section);
        await waitForTreeItems(section, 5_000);

        const action = await section.getAction(
            "Reset bundle variables to default values"
        );

        assert(action);
        await (await action.elem).click();

        await browser.waitUntil(
            async () => {
                await assertVariableValue(section, "varWithDefault", {
                    value: "dev",
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

    it("should update view if bundle changes", async function () {
        schemaDef.targets!["dev_test"].variables!["varWithDefault"] =
            "changed value in bundle";

        await writeRootBundleConfig(schemaDef, vscodeWorkspaceRoot);

        const section = (await getViewSection("BUNDLE VARIABLES VIEW")) as
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
