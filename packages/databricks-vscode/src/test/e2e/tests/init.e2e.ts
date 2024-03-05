import assert from "node:assert";
import {dismissNotifications, getViewSection} from "../utils/commonUtils.ts";
import {Workbench} from "wdio-vscode-service";
import {initProject} from "../utils/initUtils.ts";

describe("Configure Databricks Extension", async function () {
    let workbench: Workbench;

    this.timeout(3 * 60 * 1000);

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
        workbench = await browser.getWorkbench();
        await dismissNotifications();
    });

    it("should wait for extension activation", async () => {
        const section = await getViewSection("CONFIGURATION");
        assert(section);
    });

    it("should initialize new project", async function () {
        await browser.executeWorkbench((vscode) => {
            vscode.commands.executeCommand("databricks.bundle.initNewProject");
        });
        initProject(workbench);
    });
});
