import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getBasicBundleConfig, writeRootBundleConfig } from "./utils/bundle-fixtures.ts";
import {
    executeCommandWhenAvailable,
    getConfigurationItem,
    waitForInput,
    waitForLogin,
    waitForNotification,
} from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";

/**
 * The AI tools first-run prompt and its undo (AI-01), the
 * row in Models & AI tools (AI-03), and the start of the install flow (AI-02),
 * which no frozen spec covers. The spec never installs: an install writes
 * into the coding agents' configuration under the user's home folder. It
 * needs the tools not to be installed for this user; otherwise there is no
 * prompt, and the spec is skipped.
 */

const PROMPT = "Install Databricks AI tools?";
const MODELS = "MODELS & AI TOOLS";

describe("AI tools prompt and row", async function () {
    this.timeout(3 * 60 * 1000);

    before(async function () {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        if (
            fs.existsSync(
                path.join(os.homedir(), ".databricks", "aitools", "skills", ".state.json"),
            )
        ) {
            // Installed globally: the extension rightly doesn't prompt.
            this.skip();
        }
        await writeRootBundleConfig(getBasicBundleConfig({}, false), process.env.WORKSPACE_PATH);
    });

    it("should offer to install the AI tools at activation, and hide the offer when asked (AI-01)", async () => {
        await waitForNotification(PROMPT, "Don't show again");
        await waitForLogin("DEFAULT");
        await dismissNotifications();
    });

    it("should offer the prompt again from the palette", async () => {
        await executeCommandWhenAvailable("Databricks: Show AI tools install prompt again");
        await waitForNotification(PROMPT);
        await dismissNotifications();
    });

    it("should show the Install AI tools row in MODELS & AI TOOLS (AI-03)", async () => {
        await browser.waitUntil(
            async () => (await getConfigurationItem("Install AI tools", MODELS)) !== undefined,
            {
                timeout: 60_000,
                interval: 1_000,
                timeoutMsg: 'MODELS & AI TOOLS has no "Install AI tools" row',
            },
        );
    });

    it("should ask where to install from the row, and do nothing when dismissed (AI-02)", async () => {
        const row = await getConfigurationItem("Install AI tools", MODELS);
        await row!.select();
        const input = await waitForInput();
        await browser.waitUntil(
            async () => (await input.getTitle()) === "Install Databricks AI tools",
            {
                timeout: 10_000,
                timeoutMsg: "The scope picker didn't open",
            },
        );
        const labels = await Promise.all((await input.getQuickPicks()).map((p) => p.getLabel()));
        assert(
            labels.some((l) => l.includes("Global")) && labels.some((l) => l.includes("Project")),
            `Unexpected scopes: ${labels.join(", ")}`,
        );
        await input.cancel();
        assert(
            await getConfigurationItem("Install AI tools", MODELS),
            "The row changed after dismissing the picker",
        );
        assert(
            !fs.existsSync(path.join(process.env.WORKSPACE_PATH!, ".databricks", "aitools")),
            "Something was installed into the project",
        );
    });
});
