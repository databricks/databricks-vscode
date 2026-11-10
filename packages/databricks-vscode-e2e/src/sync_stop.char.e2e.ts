import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { NotificationType } from "wdio-vscode-service";
import {
    getBasicBundleConfig,
    getUniqueResourceName,
    writeRootBundleConfig,
} from "./utils/bundle-fixtures.ts";
import { waitForLogin, waitForSyncComplete, waitForSyncState } from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { getViewSection } from "./utils/view.ts";

/**
 * Characterization spec: stopping sync (SYNC-02) had
 * no e2e coverage. Start
 * sync, wait for WATCHING_FOR_CHANGES, run `databricks.sync.stop`: the
 * Remote Folder's state is STOPPED, and no error notification shows.
 */
describe("Stop sync", async function () {
    let vscodeWorkspaceRoot: string;

    this.timeout(3 * 60 * 1000);

    before(async function () {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH env var doesn't exist");
        vscodeWorkspaceRoot = process.env.WORKSPACE_PATH;
        /* eslint-disable @typescript-eslint/naming-convention */
        await writeRootBundleConfig(
            getBasicBundleConfig({
                bundle: { name: getUniqueResourceName("sync_stop"), deployment: {} },
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
            }),
            vscodeWorkspaceRoot,
        );
        /* eslint-enable @typescript-eslint/naming-convention */
        await fs.mkdir(path.join(vscodeWorkspaceRoot, "src"), { recursive: true });
        await fs.writeFile(
            path.join(vscodeWorkspaceRoot, "src", "notebook.py"),
            "print('sync stop')",
        );
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

    it("should start sync and watch for changes", async () => {
        await browser.executeWorkbench((vscode) => {
            vscode.commands.executeCommand("databricks.sync.start");
        });
        await waitForSyncComplete();
    });

    it("should stop sync without an error", async () => {
        await browser.executeWorkbench(async (vscode) => {
            await vscode.commands.executeCommand("databricks.sync.stop");
        });
        await waitForSyncState("STOPPED", 20_000);

        const workbench = await browser.getWorkbench();
        const errors: string[] = [];
        for (const notification of await workbench.getNotifications()) {
            if ((await notification.getType()) === NotificationType.Error) {
                errors.push(await notification.getMessage());
            }
        }
        assert.deepStrictEqual(errors, []);
    });
});
