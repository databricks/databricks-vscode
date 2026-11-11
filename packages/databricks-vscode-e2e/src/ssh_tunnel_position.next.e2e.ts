import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    getUniqueResourceName,
    profileHost,
    writeRootBundleConfig,
} from "./utils/bundle-fixtures.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { waitUntilSeen } from "./utils/wait.ts";
import { viewTitles } from "./utils/view.ts";

/**
 * The SSH Tunnel view sits above Project in a window without a bundle, and
 * below the bundle views once a bundle with a target is there. The view has a
 * second ID for each place. The spec removes the bundle it writes.
 */
describe("SSH Tunnel position in a bundle project", async function () {
    this.timeout(3 * 60 * 1000);

    const shots = process.env.SSH_TUNNEL_SHOTS ?? path.join(os.tmpdir(), "ssh-tunnel-position");

    /** The positions of the SSH Tunnel view and Project, top to bottom, from the sidebar's titles. */
    async function positions(): Promise<{ titles: string[]; ssh: number; project: number }> {
        const titles = (await viewTitles()).map((t) => t.toUpperCase());
        return {
            titles,
            ssh: titles.findIndex((t) => t.includes("SSH TUNNEL")),
            project: titles.findIndex((t) => t.includes("PROJECT")),
        };
    }

    async function waitForPositions(
        what: string,
        ok: (p: { titles: string[]; ssh: number; project: number }) => boolean,
    ) {
        let last: { titles: string[]; ssh: number; project: number } | undefined;
        await waitUntilSeen(
            async () => {
                last = await positions();
                return ok(last);
            },
            { timeout: 60_000, interval: 1_000, timeoutMsg: what },
            () => `the views are ${last?.titles.join(", ")}`,
        );
    }

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        fs.mkdirSync(shots, { recursive: true });
        // No bundle yet: the window is a plain folder, with no target.
        await fs.promises.rm(path.join(process.env.WORKSPACE_PATH, "databricks.yml"), {
            force: true,
        });
        await dismissNotifications();
    });

    it("shows SSH Tunnel above Project while no target is set", async () => {
        await waitForPositions(
            "SSH Tunnel should be above Project with no target (it shows only while signed in)",
            (p) => p.ssh >= 0 && p.project >= 0 && p.ssh < p.project,
        );
        await browser.saveScreenshot(path.join(shots, "1-no-target.png"));
    });

    it("moves SSH Tunnel below the bundle views once a bundle with a target is there", async () => {
        const host = process.env.DATABRICKS_HOST ?? profileHost();
        await writeRootBundleConfig(
            {
                bundle: { name: getUniqueResourceName("ssh_tunnel_position") },
                targets: { dev_test: { mode: "development", default: true, workspace: { host } } },
            },
            process.env.WORKSPACE_PATH!,
        );
        await waitForPositions(
            "SSH Tunnel should be below Project and the bundle views once a target is set",
            (p) => p.ssh >= 0 && p.project >= 0 && p.ssh > p.project,
        );
        await browser.saveScreenshot(path.join(shots, "2-target-set.png"));
    });

    after(async () => {
        // The root bundle would otherwise stay in the worker's folder for the next spec.
        if (process.env.WORKSPACE_PATH !== undefined) {
            await fs.promises.rm(path.join(process.env.WORKSPACE_PATH, "databricks.yml"), {
                force: true,
            });
        }
    });
});
