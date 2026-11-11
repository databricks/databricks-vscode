import { sleep, type Notification } from "wdio-vscode-service";

/**
 * Drains all VS Code notifications and closes the "What's New" CHANGELOG
 * preview tab if the extension opened one on activation.
 *
 * A single dismissal pass is not sufficient in CI: notifications arrive
 * asynchronously during extension activation, and on the Windows shard we
 * observed late-arriving toasts intercepting clicks (e.g. quick-input widget
 * not displayed, .monaco-select-box not clickable because the notification
 * list covers it). We poll and dismiss until the notification list stays
 * empty across two consecutive checks, or the overall timeout expires.
 *
 * We also close the CHANGELOG preview: `showWhatsNewPopup` in the extension
 * fires `markdown.showPreview` on every activation with a fresh globalState
 * (i.e. every CI run) and races test setup. On Windows it sometimes wins the
 * race and steals the active-editor slot ("No editor with title
 * 'vscode.bundlevars.json' found, available editor were: Preview CHANGELOG.md").
 */
export async function dismissNotifications({
    timeoutMs = 8000,
    quietMs = 500,
}: { timeoutMs?: number; quietMs?: number } = {}) {
    const workbench = await browser.getWorkbench();
    const deadline = Date.now() + timeoutMs;
    let consecutiveEmpty = 0;
    while (Date.now() < deadline) {
        let notifs: Notification[];
        try {
            notifs = await workbench.getNotifications();
        } catch {
            notifs = [];
        }
        if (notifs.length === 0) {
            consecutiveEmpty += 1;
            if (consecutiveEmpty >= 2) {
                break;
            }
            await sleep(quietMs);
            continue;
        }
        consecutiveEmpty = 0;
        for (const n of notifs) {
            try {
                await n.dismiss();
            } catch {
                // Notification vanished between listing and dismiss — ignore.
            }
        }
        await sleep(quietMs);
    }

    // Close the "What's New" CHANGELOG preview tab if the extension opened it.
    try {
        const editorView = workbench.getEditorView();
        const tabs = await editorView.getOpenTabs();
        for (const tab of tabs) {
            const title = (await tab.getTitle()) ?? "";
            if (/CHANGELOG\.md/i.test(title)) {
                try {
                    await editorView.closeEditor(title);
                } catch {
                    // Best-effort: a later test that opens its own editor will
                    // still succeed because it targets a specific title.
                }
            }
        }
    } catch {
        // Ignore: workbench editor view might not be ready yet.
    }
}
