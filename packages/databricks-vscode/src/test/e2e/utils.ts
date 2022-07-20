import {Key} from "selenium-webdriver";
import {InputBox, EditorView, Workbench} from "vscode-extension-tester";

// work around for https://github.com/redhat-developer/vscode-extension-tester/issues/470
export async function openCommandPrompt(
    workbench: Workbench
): Promise<InputBox> {
    const webview = await new EditorView().findElements(
        (EditorView as any).locators.EditorView.webView
    );
    if (webview.length > 0) {
        const tab = await new EditorView().getActiveTab();
        if (tab) {
            await tab.sendKeys(Key.F1);
            return InputBox.create();
        }
    }
    if (process.platform === "darwin") {
        await workbench.getDriver().actions().sendKeys(Key.F1).perform();
    } else {
        await workbench
            .getDriver()
            .actions()
            .keyDown(Key.CONTROL)
            .keyDown(Key.SHIFT)
            .sendKeys("p")
            .perform();
    }

    return InputBox.create();
}
