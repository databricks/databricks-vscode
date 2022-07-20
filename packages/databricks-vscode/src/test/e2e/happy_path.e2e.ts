// import the webdriver and the high level browser wrapper
import assert = require("node:assert");
import path = require("node:path");
import * as fs from "fs/promises";
import * as tmp from "tmp-promise";
import {
    VSBrowser,
    WebDriver,
    ActivityBar,
    InputBox,
    Workbench,
} from "vscode-extension-tester";
import {openCommandPrompt} from "./utils";

// Create a Mocha suite
describe("My Test Suite", function () {
    let browser: VSBrowser;
    let driver: WebDriver;

    let projectDir: string;
    let cleanup: () => void;

    this.timeout(20_000);

    before(async () => {
        browser = VSBrowser.instance;
        driver = browser.driver;

        ({path: projectDir, cleanup} = await tmp.dir());
    });

    after(() => {
        cleanup();
    });

    it("should open VSCode", async () => {
        const title = await driver.getTitle();
        assert(title.indexOf("Get Started") >= 0);
    });

    it("should dismiss notifications", async () => {
        await new Promise((resolve) => setTimeout(resolve, 6000));
        const notifications = await new Workbench().getNotifications();
        for (const n of notifications) {
            await n.dismiss();
        }
    });

    it("should open project folder", async () => {
        await fs.writeFile(path.join(projectDir, "test.txt"), "test");
        (await new ActivityBar().getViewControl("Explorer"))?.openView();

        const workbench = new Workbench();
        const prompt = await openCommandPrompt(workbench);
        await prompt.setText(">File: Open Folder");
        await prompt.confirm();

        const input = await InputBox.create();
        await input.setText(projectDir);
        await input.confirm();

        // wait for reload to complete
        await new Promise((resolve) => setTimeout(resolve, 3000));
    });

    it("should open databricks panel", async () => {
        const control = await new ActivityBar().getViewControl("Databricks");
        assert(control);
        const view = await control.openView();
        assert(view);
    });
});
