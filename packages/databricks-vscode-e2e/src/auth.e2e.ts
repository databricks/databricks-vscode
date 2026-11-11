import assert from "node:assert";
import { getBasicBundleConfig, writeRootBundleConfig } from "./utils/bundle-fixtures.ts";
import {
    getWorkspaceConnectionItem,
    waitForInput,
    waitForLogin,
    waitForWorkspaceConnection,
} from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { getViewSection } from "./utils/view.ts";

describe("Configure Databricks Extension", async function () {
    this.timeout(3 * 60 * 1000);

    it("should open VSCode and dismiss notifications", async function () {
        assert(process.env.DATABRICKS_CONFIG_FILE, "DATABRICKS_CONFIG_FILE doesn't exist");
        const workbench = await browser.getWorkbench();
        const title = await workbench.getTitleBar().getTitle();
        assert(title.indexOf("[Extension Development Host]") >= 0, "Unexpected VSCode title");
        await dismissNotifications();
    });

    it("should wait for a welcome screen", async () => {
        const section = await getViewSection("PROJECT");
        const welcomeButtons = await browser.waitUntil(async () => {
            const welcome = await section!.findWelcomeContent();
            const buttons = await welcome!.getButtons();
            if (buttons?.length >= 2) {
                return buttons;
            }
        });
        assert(welcomeButtons, "Welcome buttons don't exist");
    });

    it("should automatically login after detecting bundle configuration", async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        await writeRootBundleConfig(getBasicBundleConfig(), process.env.WORKSPACE_PATH);
        await waitForLogin("DEFAULT");
    });

    it("should create new profile", async () => {
        // We create a new profile programmatically to avoid leaking tokens through screenshots or video reporters.
        // We still trigger similar code path to the UI flow.
        await browser.executeWorkbench(async (vscode) => {
            await vscode.commands.executeCommand(
                "databricks.connection.saveNewProfile",
                "NEW_PROFILE",
            );
        });
    });

    it("should wait for extension activation", async () => {
        const section = await getViewSection("PROJECT");
        assert(section);
    });

    it("should change profiles", async () => {
        // NEW_PROFILE is for DEFAULT's workspace too, so the target asks which to use: the
        // workspace row reads "Select a profile", and clicking it picks one.
        await waitForWorkspaceConnection("Select a profile");
        const row = await getWorkspaceConnectionItem();
        assert(row, "The Workspace connection row doesn't exist");
        await row.select();

        const authMethodInput = await waitForInput();
        const newProfilePick = await authMethodInput.findQuickPick("NEW_PROFILE");
        assert(newProfilePick, "NEW_PROFILE is absent in the quick pick selection");
        await newProfilePick.select();
        await waitForLogin("NEW_PROFILE");
    });

    it("should pick up new profile after restarting VS Code", async () => {
        // On VS Code 1.104+ a window reload cancels the extension test runner and
        // VS Code exits, ending the test session. Restart VS Code on the same
        // workspace instead: the selected profile is saved in the workspace.
        await browser.reloadSession();
        await waitForLogin("NEW_PROFILE");
    });
});
