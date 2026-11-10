/*
 * Ported from the old `commonUtils.ts` and `customCommands/elementCustomCommands.ts`:
 * waiting for the "Databricks Job Run" panel of "Run File as Workflow".
 */

/** The text of the element whose accessible name is `label` (the old `browser.getTextByLabel`). */
async function getTextByLabel(label: string): Promise<string> {
    return browser.$(`aria/${label}`).getText();
}

/**
 * Waits until the panel opens, shows a task run ID and a start time, and the
 * run succeeds; then looks for `expectedOutput` in the output frame. As in the
 * old helper, the frame checks aren't awaited, so they don't fail the spec
 *.
 */
export async function waitForWorkflowWebview(expectedOutput: string | string[]) {
    const workbench = await browser.getWorkbench();
    const title = /Databricks Job Run/;
    await browser.waitUntil(
        async () => {
            try {
                const webView = await workbench.getWebviewByTitle(title);
                return webView !== undefined;
            } catch {
                return false;
            }
        },
        {
            // The workflow run must be submitted and the "Databricks Job Run"
            // webview panel materialized before this resolves; on the Windows
            // shard 5s is not enough and the panel intermittently misses the
            // window ("Webview did not open"). 60s covers observed open times.
            timeout: 60_000,
            interval: 2_000,
            timeoutMsg: "Webview did not open",
        },
    );
    const webView = await workbench.getWebviewByTitle(title);
    await webView.open();

    await browser.waitUntil(
        async () => {
            const runId = await getTextByLabel("task-run-id");
            return !/N\\A/.test(runId);
        },
        {
            timeoutMsg: "Job did not start",
        },
    );

    // The run start time renders as a "-" placeholder until the run details
    // arrive, so poll until it is populated rather than asserting once.
    await browser.waitUntil(
        async () => {
            const startTime = await getTextByLabel("run-start-time");
            console.log("Run start time:", startTime);
            return startTime !== "-" && startTime.trim().length > 0;
        },
        {
            timeout: 60_000,
            interval: 1_000,
            timeoutMsg: "Run start time did not populate (still '-')",
        },
    );

    await browser.waitUntil(
        async () => {
            const status = await getTextByLabel("run-status");
            console.log("Run status:", status);
            return status.includes("Succeeded");
        },
        {
            timeout: 180_000,
            interval: 100,
            timeoutMsg: "Job did not reach succeeded status after 180s.",
        },
    );

    const iframe = browser.$("#frame");
    // oxlint-disable-next-line typescript/no-floating-promises -- not awaited in the old helper either
    browser.switchToFrame(iframe);
    const iframeRoot = await browser.$("html").getElement();
    expect(webView.activeFrame);
    if (!Array.isArray(expectedOutput)) {
        expectedOutput = [expectedOutput];
    }
    for (const output of expectedOutput) {
        // oxlint-disable-next-line typescript/no-floating-promises -- as above
        expect(iframeRoot).toHaveText(output);
    }
    // oxlint-disable-next-line typescript/no-floating-promises -- as above
    browser.switchToParentFrame();
    await webView.close();
}
