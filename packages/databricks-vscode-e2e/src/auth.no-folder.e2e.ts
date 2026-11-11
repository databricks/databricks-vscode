import assert from "node:assert";
import { CustomTreeSection, InputBox } from "wdio-vscode-service";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { expandRows, getViewSection, rowTexts, viewTitles } from "./utils/view.ts";

/**
 * With no folder open, the extension connects to the CLI's default profile,
 * signs out, and signs in again through the wizard. CONNECTION is where that
 * happens: signed in, it shows the workspace connection, with its workspace,
 * user and auth type a click away, and the Unity Gateway connection, which
 * the first sign-in copied. Signing out of the workspace leaves Unity Gateway; signed
 * out of both, CONNECTION shows the sign-in button, which PROJECT no longer
 * has, and signing in there signs both in again. SSH Tunnel and Workspace file
 * system show only while the workspace is signed in.
 *
 * Needs a `[DEFAULT]` profile in DATABRICKS_CONFIG_FILE that can sign in.
 */

const SIGN_IN = "Sign in to Databricks";
/** The mock workspace's host, which the `[DEFAULT]` profile names. */
const MOCK_HOST = "https://mock.databricks.test";
const SIGNED_IN_VIEWS = ["SSH Tunnel", "Workspace file system"];

async function connectionStatus(): Promise<string | undefined> {
    const items = await (await browser.getWorkbench()).getStatusBar().getItems();
    return items.find((item) => item.includes("Databricks:"));
}

// These waits fail with the last value seen: a `timeoutMsg` is built before the first poll.
async function waitForStatus(text: string) {
    let last: string | undefined;
    try {
        await browser.waitUntil(
            async () => (last = await connectionStatus())?.includes(text) === true,
            { timeout: 60_000, interval: 1_000 },
        );
    } catch {
        throw new Error(`The status bar never showed "${text}"; it shows "${last}"`);
    }
}

/**
 * Waits until CONNECTION shows the rows `expected`, each as `rowTexts` gives it, or a row's label alone.
 * The connection rows start collapsed: each poll expands them, to show their details.
 */
async function waitForConnectionRows(expected: string[]) {
    let rows: string[] = [];
    try {
        await browser.waitUntil(
            async () => {
                const section = (await getViewSection("CONNECTION")) as CustomTreeSection;
                await expandRows(section);
                rows = await rowTexts(section);
                return expected.every((e) => rows.some((r) => r === e || r.startsWith(`${e}: `)));
            },
            { timeout: 30_000, interval: 1_000 },
        );
    } catch {
        throw new Error(
            `CONNECTION never showed ${expected.join(", ")}; it shows ${rows.join(", ")}`,
        );
    }
}

/** The buttons of a view's welcome, which shows only while the view has no rows. */
async function welcomeButtons(name: "CONNECTION" | "PROJECT") {
    const welcome = await (await getViewSection(name))?.findWelcomeContent();
    const buttons = (await welcome?.getButtons()) ?? [];
    return Promise.all(buttons.map(async (button) => ({ title: await button.getTitle(), button })));
}

/** The text lines of a view's welcome; links in a line are text here, not buttons. */
async function welcomeTextSections(name: "CONNECTION" | "PROJECT"): Promise<string[]> {
    const welcome = await (await getViewSection(name))?.findWelcomeContent();
    return (await welcome?.getTextSections()) ?? [];
}

async function welcomeButtonTitles(name: "CONNECTION" | "PROJECT"): Promise<string[]> {
    return (await welcomeButtons(name)).map((b) => b.title);
}

/** Waits until the views in SIGNED_IN_VIEWS all show, or all are hidden. */
async function waitForSignedInViews(shown: boolean) {
    let titles: string[] = [];
    try {
        await browser.waitUntil(
            async () => {
                titles = (await viewTitles()).map((t) => t.toLowerCase());
                return SIGNED_IN_VIEWS.every((v) => titles.includes(v.toLowerCase()) === shown);
            },
            { timeout: 30_000, interval: 1_000 },
        );
    } catch {
        throw new Error(
            `${SIGNED_IN_VIEWS.join(" and ")} should ${shown ? "show" : "be hidden"}; the views are ${titles.join(", ")}`,
        );
    }
}

describe("Connect without a folder", async function () {
    this.timeout(3 * 60 * 1000);

    it("should open VS Code without a folder", async () => {
        assert(process.env.DATABRICKS_CONFIG_FILE, "DATABRICKS_CONFIG_FILE doesn't exist");
        const folders = await browser.executeWorkbench(
            (vscode) => vscode.workspace.workspaceFolders?.length ?? 0,
        );
        assert.strictEqual(folders, 0);
        await dismissNotifications();
    });

    it("should connect to the DEFAULT profile and show it in the status bar", async () => {
        // Opening the Databricks view activates the extension.
        assert(await getViewSection("CONNECTION"));
        await waitForStatus("Databricks: DEFAULT");
    });

    it("should show the connection's details in CONNECTION, and Unity Gateway on the same profile", async () => {
        await waitForConnectionRows([
            "Workspace connection: DEFAULT",
            `Host: ${MOCK_HOST}`,
            // The mock returns it as `x-databricks-org-id`.
            "Workspace: 1234",
            "User: e2e@example.com",
            "Auth type: Personal Access Token",
            "Unity Gateway connection: DEFAULT",
        ]);
        assert.deepStrictEqual(
            await welcomeButtonTitles("CONNECTION"),
            [],
            "CONNECTION shows its welcome while signed in",
        );
    });

    it("should show SSH Tunnel and Workspace file system while signed in", async () => {
        await waitForSignedInViews(true);
    });

    it("should show the no-folder welcome in PROJECT, without switching the connection there", async () => {
        const buttons = await browser.waitUntil(async () => {
            const titles = await welcomeButtonTitles("PROJECT");
            return titles.includes("Open folder") &&
                titles.includes("Create a new Databricks project")
                ? titles
                : false;
        });
        assert(buttons, "The no-folder welcome buttons don't exist");
        assert(
            !buttons.includes("Change connection"),
            `PROJECT offers ${buttons.join(", ")}; CONNECTION has the switch`,
        );
    });

    it("should sign out of the workspace, and leave Unity Gateway signed in", async () => {
        await browser.executeWorkbench(async (vscode) => {
            await vscode.commands.executeCommand("databricks.connection.logout");
        });
        await waitForStatus("Sign in");
        await waitForConnectionRows([
            "Workspace connection: Not signed in",
            "Unity Gateway connection: DEFAULT",
        ]);
    });

    it("should sign out of Unity Gateway", async () => {
        await browser.executeWorkbench(async (vscode) => {
            await vscode.commands.executeCommand("databricks.unityGateway.signOut");
        });
    });

    it("should offer to sign in, the docs and the Quickstart in CONNECTION, and not in PROJECT", async () => {
        const titles = await browser.waitUntil(
            async () => {
                const found = await welcomeButtonTitles("CONNECTION");
                return found.includes(SIGN_IN) ? found : false;
            },
            {
                timeout: 30_000,
                interval: 1_000,
                timeoutMsg: `CONNECTION doesn't offer "${SIGN_IN}"`,
            },
        );
        assert(titles.length === 1, `CONNECTION's buttons are ${titles.join(", ")}`);
        const text = (await welcomeTextSections("CONNECTION")).join("\n");
        assert(
            text.includes("read our docs") && text.includes("Quickstart guide"),
            `CONNECTION's welcome text is ${text}`,
        );
        assert(
            !(await welcomeButtonTitles("PROJECT")).includes(SIGN_IN),
            `PROJECT still offers "${SIGN_IN}"`,
        );
    });

    it("should hide SSH Tunnel and Workspace file system while signed out", async () => {
        await waitForSignedInViews(false);
    });

    it("should sign both in again from CONNECTION with the DEFAULT profile", async () => {
        const signIn = (await welcomeButtons("CONNECTION")).find((b) => b.title === SIGN_IN);
        assert(signIn, `CONNECTION has no "${SIGN_IN}" button`);
        await signIn.button.elem.click();
        const workbench = await browser.getWorkbench();
        const input = await new InputBox(workbench.locatorMap).wait();

        // Step 1: the host signed out of is preselected; confirm it.
        await browser.waitUntil(
            async () => (await input.getPlaceHolder()).includes("Databricks Host"),
            {
                timeoutMsg: "The host step didn't open",
            },
        );
        await input.confirm();

        // Step 2: the profiles for that host.
        await browser.waitUntil(async () => (await input.findQuickPick("DEFAULT")) !== undefined, {
            timeoutMsg: "The profile step doesn't list DEFAULT",
        });
        await input.selectQuickPick("DEFAULT");

        await waitForStatus("Databricks: DEFAULT");
        // Signed out of both, the sign-in signs Unity Gateway in too.
        await waitForConnectionRows([
            "Workspace connection: DEFAULT",
            `Host: ${MOCK_HOST}`,
            "Unity Gateway connection: DEFAULT",
        ]);
        await waitForSignedInViews(true);
    });
});
