import assert from "node:assert";
import {
    dismissNotifications,
    waitForInput,
    getViewSection,
    waitForLogin,
} from "./utils/commonUtils.ts";
import {CustomTreeSection} from "wdio-vscode-service";
import {
    getBasicBundleConfig,
    writeRootBundleConfig,
} from "./utils/dabsFixtures.ts";

describe("Configure Databricks Extension", async function () {
    this.timeout(3 * 60 * 1000);

    it("should open VSCode and dismiss notifications", async function () {
        assert(
            process.env.DATABRICKS_CONFIG_FILE,
            "DATABRICKS_CONFIG_FILE doesn't exist"
        );
        const workbench = await browser.getWorkbench();
        const title = await workbench.getTitleBar().getTitle();
        assert(
            title.indexOf("[Extension Development Host]") >= 0,
            "Unexpected VSCode title"
        );
        await dismissNotifications();
    });

    it("should wait for a welcome screen", async () => {
        const section = await getViewSection("CONFIGURATION");
        const welcomeButtons = await browser.waitUntil(async () => {
            const welcome = await section!.findWelcomeContent();
            const buttons = await welcome!.getButtons();
            if (buttons?.length >= 2) {
                return buttons;
            }
        });
        assert(welcomeButtons, "Welcome buttons don't exist");
        const initTitle = await welcomeButtons[0].getTitle();
        const quickStartTitle = await welcomeButtons[1].getTitle();
        assert(
            initTitle.toLowerCase().includes("initialize"),
            "'initialize` button doesn't exist"
        );
        assert(
            quickStartTitle.toLowerCase().includes("quickstart"),
            "'quickstart' button doesn't exist"
        );
    });

    it("should automatically login after detecting bundle configuration", async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        await writeRootBundleConfig(
            getBasicBundleConfig(),
            process.env.WORKSPACE_PATH
        );
        await waitForLogin("DEFAULT");
    });

    it("should create new profile", async () => {
        // We create a new profile programmatically to avoid leaking tokens through screenshots or video reporters.
        // We still trigger similar code path to the UI flow.
        await browser.executeWorkbench(async (vscode) => {
            await vscode.commands.executeCommand(
                "databricks.connection.saveNewProfile",
                "NEW_PROFILE"
            );
        });
    });

    it("should change profiles", async () => {
        const section = (await getViewSection(
            "CONFIGURATION"
        )) as CustomTreeSection;
        assert(section, "CONFIGURATION section doesn't exist");
        const signInButton = await browser.waitUntil(
            async () => {
                const items = await section.getVisibleItems();
                for (const item of items) {
                    const label = await item.getLabel();
                    if (label.toLowerCase().includes("auth type")) {
                        return item.getActionButton("Sign in");
                    }
                }
            },
            {timeout: 10_000}
        );
        assert(signInButton, "Sign In button doesn't exist");
        (await signInButton.elem).click();

        const authMethodInput = await waitForInput();
        const newProfilePick = await authMethodInput.findQuickPick(
            "NEW_PROFILE"
        );
        assert(
            newProfilePick,
            "NEW_PROFILE is absent in the quick pick selection"
        );
        await newProfilePick.select();
        await waitForLogin("NEW_PROFILE");
    });

    it("should pick up new profile after reloading", async () => {
        const workbench = await driver.getWorkbench();
        const editorView = workbench.getEditorView();
        await editorView.closeAllEditors();
        await workbench.executeCommand("Developer: Reload Window");
        await waitForLogin("NEW_PROFILE");
    });
});
