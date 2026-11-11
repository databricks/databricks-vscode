import assert from "node:assert";
import {
    getBasicBundleConfig,
    getUniqueResourceName,
    writeRootBundleConfig,
} from "./utils/bundle-fixtures.ts";
import { waitForLogin, waitForSyncComplete } from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { getViewSection } from "./utils/view.ts";
import { WorkspaceClient } from "./utils/workspace-client.ts";
import path from "node:path";
import fs from "fs/promises";

/*
 * Ported from the frozen suite. The imports differ: `BundleSchema` is a local
 * type, because the fixtures don't have the generated schema, and
 * `WorkspaceClient` is the modular-SDK stand-in, which reads the
 * [DEFAULT] profile. The DATABRICKS_HOST and DATABRICKS_TOKEN preconditions
 * are dropped: this harness doesn't set them, and the client authenticates
 * with the profile the extension signs in with.
 */
type BundleSchema = Record<string, unknown>;

describe("Sync", async function () {
    let vscodeWorkspaceRoot: string;
    let workspaceClient: WorkspaceClient;
    let projectName: string;

    this.timeout(3 * 60 * 1000);

    async function createProject() {
        /**
         * process.env.WORKSPACE_PATH (cwd)
         *  ├── databricks.yml
         *  └── src
         *    └── notebook.py
         */

        projectName = getUniqueResourceName("sync");
        /* eslint-disable @typescript-eslint/naming-convention */

        const schemaDef: BundleSchema = getBasicBundleConfig({
            bundle: {
                name: projectName,
                deployment: {},
            },
            targets: {
                dev_test: {
                    default: true,
                    mode: "development",
                    workspace: {
                        root_path:
                            "/Users/${workspace.current_user.userName}/vscode-integration-test/${bundle.name}",
                    },
                },
            },
        });
        /* eslint-enable @typescript-eslint/naming-convention */

        await writeRootBundleConfig(schemaDef, vscodeWorkspaceRoot);

        await fs.mkdir(path.join(vscodeWorkspaceRoot, "src"), {
            recursive: true,
        });
    }

    before(async function () {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH env var doesn't exist");

        vscodeWorkspaceRoot = process.env.WORKSPACE_PATH;
        workspaceClient = new WorkspaceClient({
            configFile: process.env.DATABRICKS_CONFIG_FILE,
            profile: "DEFAULT",
        });
        await createProject();
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

    it("should sync files", async () => {
        await browser.executeWorkbench((vscode) => {
            vscode.commands.executeCommand("databricks.sync.start");
        });

        const notebookContent = "print('original content')";
        await fs.writeFile(path.join(vscodeWorkspaceRoot, "src", "notebook.py"), notebookContent);

        await waitForSyncComplete();

        const userName = (await workspaceClient.currentUser.me()).userName;
        const workspacePath = `/Users/${userName}/vscode-integration-test/${projectName}/files/src/notebook.py`;
        const file = await workspaceClient.workspace.export({
            path: workspacePath,
        });

        assert(file.content);
        assert.strictEqual(atob(file.content), notebookContent);
    });

    it("should watch for file changes and sync changed files", async () => {
        const newNotebookContent = "print('Hello, World!')";
        await fs.writeFile(
            path.join(vscodeWorkspaceRoot, "src", "notebook.py"),
            newNotebookContent,
        );

        await browser.executeWorkbench((vscode) => {
            vscode.commands.executeCommand("workbench.action.files.saveAll");
        });

        await waitForSyncComplete();

        const userName = (await workspaceClient.currentUser.me()).userName;
        const workspacePath = `/Users/${userName}/vscode-integration-test/${projectName}/files/src/notebook.py`;
        const file = await workspaceClient.workspace.export({
            path: workspacePath,
        });

        assert(file.content);
        assert.strictEqual(atob(file.content), newNotebookContent);
    });
});
