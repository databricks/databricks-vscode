import {Key} from "selenium-webdriver";
import {
    InputBox,
    EditorView,
    Workbench,
    ActivityBar,
    ViewSection,
    VSBrowser,
} from "vscode-extension-tester";

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
            ``;
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

export async function openFolder(
    browser: VSBrowser,
    projectDir: string
): Promise<void> {
    try {
        await browser.openResources(projectDir);
    } catch (e) {}

    await browser.driver.sleep(1000);
    await browser.waitForWorkbench();
}

export async function getViewSection(
    name: string
): Promise<ViewSection | undefined> {
    const control = await new ActivityBar().getViewControl("Databricks");
    const view = await control?.openView();
    const content = await view?.getContent();
    const section = await content?.getSection(name);
    await section?.expand();
    await section?.click();
    return section;
}

export async function waitForTreeItems(
    section: ViewSection,
    timeoutMs = 5000
): Promise<boolean> {
    const start = Date.now();
    while (true) {
        const items = await section.getVisibleItems();
        if (items.length > 0) {
            return true;
        }
        if (Date.now() - start > timeoutMs) {
            return false;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
}
