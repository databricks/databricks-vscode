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
import {openCommandPrompt, openFolder} from "./utils";

describe("Run python on cluster", function () {
    // these will be populated by the before() function
    let browser: VSBrowser;
    let driver: WebDriver;
    let projectDir: string;
    let cleanup: () => void;

    this.timeout(20_000);

    before(async () => {
        browser = VSBrowser.instance;
        driver = browser.driver;

        ({path: projectDir, cleanup} = await tmp.dir());

        await fs.mkdir(path.join(projectDir, ".databricks"));
        await fs.writeFile(
            path.join(projectDir, ".databricks", "project.json"),
            JSON.stringify({
                clusterId: process.env["DATABRICKS_CLUSTER_ID"],
                profile: "DEFAULT",
            })
        );
        await openFolder(browser, projectDir);
    });

    after(() => {
        cleanup();
    });

    // TODO
    it("should connect to Databricks", async () => {
        const title = await driver.getTitle();
        assert(title.indexOf("Get Started") >= 0);
    });

    // TODO
    it("should run a python file on a cluster", async () => {});
});
