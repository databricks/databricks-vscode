import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
    dismissNotifications,
    getUniqueResourceName,
    waitForInput,
    waitForLogin,
} from "./utils/commonUtils.ts";
import {writeRootBundleConfig} from "./utils/dabsFixtures.ts";

describe("Remote SSH connection", function () {
    this.timeout(12 * 60_000);

    it("opens a real remote window and preserves large transfers over time", async () => {
        const root = process.env.WORKSPACE_PATH;
        const resultPath = process.env.TEST_SSH_RESULT_PATH;
        assert(
            root && process.env.DATABRICKS_HOST && resultPath,
            "SSH e2e runner configuration is missing"
        );
        await dismissNotifications();
        await writeRootBundleConfig(
            {
                bundle: {name: getUniqueResourceName("ssh")},
                targets: {
                    test: {
                        default: true,
                        workspace: {host: process.env.DATABRICKS_HOST},
                    },
                },
            },
            root
        );
        await waitForLogin("DEFAULT");
        await browser.executeWorkbench((vscode, testPath) => {
            // Electron resolves a login-shell PATH; keep the CLI's IDE launch isolated.
            process.env.PATH = testPath;
            void vscode.commands.executeCommand("databricks.ssh.startTunnel");
        }, process.env.PATH);
        const picker = await waitForInput();
        await picker.setText("Serverless");
        const item = await browser.waitUntil(
            () => picker.findQuickPick("Serverless"),
            {
                timeout: 30_000,
                timeoutMsg: "Serverless SSH compute was not offered",
            }
        );
        assert(item, "Serverless SSH compute was not offered");
        const localWindow = await browser.getWindowHandle();
        const initialWindows = await browser.getWindowHandles();
        await item.select();

        let result: {
            phase?: string;
            error?: string;
            bytesPerRound?: number;
            completedRounds?: number;
            authority?: string;
            fileName?: string;
            editorText?: string;
        } = {};
        let uiPassed = false;
        try {
            const remoteWindow = await browser.waitUntil(
                async () => {
                    const handles = await browser.getWindowHandles();
                    return handles.find(
                        (handle) => !initialWindows.includes(handle)
                    );
                },
                {
                    timeout: 180_000,
                    interval: 1000,
                    timeoutMsg: "Remote SSH did not open a new window",
                }
            );
            assert(remoteWindow);
            await browser.switchToWindow(remoteWindow);
            await browser.waitUntil(
                async () => {
                    await dismissRemoteWelcome();
                    try {
                        result = JSON.parse(
                            await fs.readFile(resultPath, "utf8")
                        );
                    } catch (error) {
                        if (
                            (error as NodeJS.ErrnoException).code === "ENOENT"
                        ) {
                            return false;
                        }
                        throw error;
                    }
                    return (
                        result.phase === "ui-ready" ||
                        result.error !== undefined
                    );
                },
                {
                    timeout: 8 * 60_000,
                    interval: 1000,
                    timeoutMsg:
                        "Remote SSH did not finish three 8 MiB round trips; inspect Remote SSH and tunnel logs",
                }
            );
            assert.equal(result.error, undefined);
            assert(result.fileName && result.editorText);
            await dismissRemoteWelcome();
            const file = browser.$(
                `//div[contains(@class, 'explorer-folders-view')]//*[contains(@class, 'label-name') and normalize-space(.)='${result.fileName}']`
            );
            const explorer = await (await browser.getWorkbench())
                .getActivityBar()
                .getViewControl("Explorer");
            assert(explorer, "Remote window has no Explorer view");
            await explorer.openView();
            await browser.waitUntil(
                async () => {
                    await dismissRemoteWelcome();
                    return (
                        (await file.isExisting()) && (await file.isDisplayed())
                    );
                },
                {
                    timeout: 30_000,
                    interval: 500,
                    timeoutMsg: "Remote Explorer did not display the test file",
                }
            );
            await file.doubleClick();
            await browser.waitUntil(
                async () => {
                    const tab = browser.$(
                        ".tabs-container .tab.active .label-name"
                    );
                    const lines = browser.$(".monaco-editor .view-lines");
                    return (
                        (await tab.isDisplayed()) &&
                        (await tab.getText()) === result.fileName &&
                        (await lines.isDisplayed()) &&
                        (await lines.getText()).includes(result.editorText!)
                    );
                },
                {
                    timeout: 30_000,
                    timeoutMsg:
                        "Remote file clicked in Explorer did not open with the expected text",
                }
            );
            uiPassed = true;
        } catch (error) {
            await browser
                .saveScreenshot(
                    path.join(
                        process.env.TEST_E2E_ROOT || ".",
                        "logs",
                        "ssh-remote-ui-failure.png"
                    )
                )
                .catch(() => {});
            throw error;
        } finally {
            await fs.writeFile(
                `${resultPath}.ui-complete`,
                uiPassed ? "passed" : "failed"
            );
            await browser.switchToWindow(localWindow);
        }
        await browser.waitUntil(
            async () => {
                result = JSON.parse(await fs.readFile(resultPath, "utf8"));
                return result.phase === "passed" || result.error !== undefined;
            },
            {
                timeout: 30_000,
                interval: 500,
                timeoutMsg: "Remote probe did not finish cleanup",
            }
        );
        assert.equal(result.error, undefined);
        assert.equal(result.phase, "passed");
        assert.equal(result.bytesPerRound, 8 * 1024 * 1024);
        assert.equal(result.completedRounds, 3);
        assert.match(result.authority!, /^ssh-remote\+/);
    });
});

/** Dismiss optional VS Code onboarding without using a personal editor account. */
async function dismissRemoteWelcome() {
    for (const label of ["continue without signing in", "get started"]) {
        const actions = await browser.$$(
            `//*[self::button or @role='button' or self::a][translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')='${label}']`
        );
        for (const action of actions) {
            if (await action.isDisplayed()) {
                await action.click();
                await action.waitForDisplayed({reverse: true, timeout: 10_000});
                console.log(`Remote welcome: clicked "${label}"`);
                break;
            }
        }
    }
}
