import assert from "node:assert";
import path from "node:path";
import * as fs from "fs/promises";
import * as tmp from "tmp-promise";
import {
    BottomBarPanel,
    VSBrowser,
    WebDriver,
    Workbench,
} from "vscode-extension-tester";
import {
    getViewSection,
    getViewSubSection,
    openCommandPrompt,
    openFolder,
    waitForTreeItems,
} from "./utils";
import {IntegrationTestLogger} from "../loggingUtils";

describe("Run python on cluster", function () {
    // these will be populated by the before() function
    let browser: VSBrowser;
    let driver: WebDriver;
    let projectDir: string;
    let cleanup: () => void;
    let logger: IntegrationTestLogger;

    this.timeout(10 * 60 * 1000);

    before(async () => {
        browser = VSBrowser.instance;
        driver = browser.driver;

        ({path: projectDir, cleanup} = await tmp.dir());

        await fs.mkdir(path.join(projectDir, ".databricks"));
        await fs.writeFile(
            path.join(projectDir, ".databricks", "project.json"),
            JSON.stringify({
                clusterId: process.env["TEST_DEFAULT_CLUSTER_ID"],
                workspacePath: process.env["TEST_REPO_PATH"],
                profile: "DEFAULT",
            })
        );
        await fs.writeFile(
            path.join(projectDir, "hello.py"),
            `spark.sql('SELECT "hello"').show()`
        );
        await openFolder(browser, projectDir);
    });

    after(async () => {
        cleanup();
    });

    beforeEach(async function () {
        const testName = this.currentTest?.title ?? "Default";
        const suiteName = this.currentTest?.parent?.title ?? "Default";

        logger = await IntegrationTestLogger.create(
            suiteName,
            testName,
            driver
        );
    });

    afterEach(async function () {
        await logger.stop();
    });

    it("should connect to Databricks", async () => {
        const title = await driver.getTitle();
        assert(title.indexOf("Get Started") >= 0);

        const section = await getViewSection("Configuration");
        assert(section);
        await waitForTreeItems(section);

        const workbench = new Workbench();
        const editorView = workbench.getEditorView();
        await editorView.closeAllEditors();
    });

    it("should start syncing", async () => {
        const repoConfigItem = await getViewSubSection("Configuration", "Repo");
        assert(repoConfigItem);
        const buttons = await repoConfigItem.getActionButtons();
        await buttons[0].click();

        // wait for sync to finish
        const terminalView = await new BottomBarPanel().openTerminalView();
        await terminalView.selectChannel("sync");

        // there seems to be no way to get the console output from the terminal
        // `terminalView.getText()` is broken
        // see https://github.com/redhat-developer/vscode-extension-tester/issues/408
        await driver.sleep(3000);
    });

    it("should run a python file on a cluster", async () => {
        // open file
        const workbench = new Workbench();
        let input = await openCommandPrompt(workbench);
        await input.setText("hello.py");
        await input.confirm();
        await driver.sleep(500);

        // run file
        input = await openCommandPrompt(workbench);
        await input.setText(">Databricks: Run File");
        await input.selectQuickPick(1);
        await driver.sleep(5000);

        // there seems to be no way to get the console output from the debug console
        // see https://github.com/redhat-developer/vscode-extension-tester/issues/408
    });
});
