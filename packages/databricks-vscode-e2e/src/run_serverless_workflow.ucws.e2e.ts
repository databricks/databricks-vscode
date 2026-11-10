import assert from "node:assert";
import { executeCommandWhenAvailable, waitForLogin } from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { openFile } from "./utils/editor.ts";
import { waitForWorkflowWebview } from "./utils/workflow.ts";
import {
    getBasicBundleConfig,
    writeHelloWorldFiles,
    writeRootBundleConfig,
} from "./utils/bundle-fixtures.ts";

/*
 * Ported from the frozen suite. The body is verbatim but for the project
 * files, which `writeHelloWorldFiles` writes; the imports differ: the helpers
 * are in this package's `utils/`.
 */
describe("Run files on serverless compute", async function () {
    let projectDir: string;
    this.timeout(3 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");

        projectDir = process.env.WORKSPACE_PATH;

        await writeHelloWorldFiles(projectDir, "show");

        await writeRootBundleConfig(getBasicBundleConfig({}, false), projectDir);
    });

    it("should wait for connection", async () => {
        await waitForLogin("DEFAULT");
        await dismissNotifications();
    });

    it("should run a python file as a serverless workflow", async () => {
        await openFile("hello.py");
        await executeCommandWhenAvailable("Databricks: Run File as Workflow");
        // Serverless compute should be selected automatically based on the serverless_compute_id cfg option
        await waitForWorkflowWebview(["hello world", "Serverless"]);
    });
});
