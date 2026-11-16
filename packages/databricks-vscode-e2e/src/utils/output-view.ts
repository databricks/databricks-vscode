import type { OutputView } from "wdio-vscode-service";

/**
 * Opens the bottom panel's Output view and returns it once it's displayed.
 *
 * The service's `openOutputView()` clicks the Output tab. When that lookup
 * fails it runs `workbench.action.output.toggleOutput`, which closes a panel
 * that's already open, and the view's 10 s wait then fails. An earlier step
 * can leave the panel open (the extension shows its bundle log before a
 * deploy), so this focuses the view first. `workbench.panel.output.focus` is
 * idempotent: it opens the panel if it's closed and keeps it on Output. The
 * focus and open pair is retried until the view shows.
 */
export async function openOutputView(): Promise<OutputView> {
    const workbench = await browser.getWorkbench();
    let view: OutputView | undefined;
    await browser.waitUntil(
        async () => {
            try {
                await browser.executeWorkbench(async (vscode) => {
                    await vscode.commands.executeCommand("workbench.panel.output.focus");
                });
                view = await workbench.getBottomBar().openOutputView();
                return true;
            } catch {
                return false;
            }
        },
        {
            timeout: 40_000,
            interval: 1_000,
            timeoutMsg: "The Output view never got displayed",
        },
    );
    return view!;
}
