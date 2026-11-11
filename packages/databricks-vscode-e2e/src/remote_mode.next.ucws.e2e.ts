import assert from "node:assert";
import path from "node:path";
import { CustomTreeSection, sleep } from "wdio-vscode-service";
import { profileHost } from "./utils/bundle-fixtures.ts";
import { findUCItem, getUCSection } from "./utils/unity-catalog.ts";
import { expandRows, getViewSection, rowTexts, viewTitles } from "./utils/view.ts";

/**
 * The extension in a session window, whose extension host runs on
 * Databricks compute (remote mode, SSH-03), which no frozen spec
 * covers. `wdio.conf.ts` starts this spec's VS Code with a serverless
 * session's environment (`src/utils/remote.ts`): DATABRICKS_REMOTE_ENV, the
 * session's interpreter, its compute, and the [DEFAULT] profile's host and
 * PAT or M2M credentials. Its folder holds a bundle whose target names no
 * host (`src/resources/seed/remote_mode.next.ucws/`), as the tunnel's
 * default folder does. What a session window lacks is hidden: the views
 * the features declare unavailable there; Connection shows the session's
 * workspace and compute and doesn't offer to sign in; the project runs with
 * the session's credentials; Unity Catalog lists without signing in; the
 * session's interpreter becomes the active one; no AI tools prompt appears;
 * and the tunnel refuses, saying what to do instead. Skipped when the
 * profile has neither a token nor M2M credentials.
 */

const SHOWN = ["Connection", "Project", "Unity Catalog"];
/** The views the features declare unavailable in a session (`Feature.session`); Compute is behind an experiment. */
const HIDDEN = ["Models & AI tools", "SSH Tunnel", "Workspace file system", "Compute"];

describe("Remote mode", async function () {
    this.timeout(3 * 60 * 1000);

    before(function () {
        if (process.env.DATABRICKS_REMOTE_ENV !== "1") {
            // The profile has no PAT or M2M credentials to give the session.
            this.skip();
        }
    });

    it("should show the views a session window has, and none it lacks", async () => {
        let titles: string[] = [];
        try {
            await browser.waitUntil(
                async () => {
                    titles = (await viewTitles()).map((t) => t.toLowerCase());
                    return SHOWN.every((t) => titles.includes(t.toLowerCase()));
                },
                { timeout: 90_000, interval: 2_000 },
            );
        } catch {
            // Not a timeoutMsg: that is built before the first poll.
            throw new Error(
                `${SHOWN.join(", ")} don't all show; the sections are ${titles.join(", ")}`,
            );
        }
        for (const hidden of HIDDEN) {
            assert(!titles.includes(hidden.toLowerCase()), `"${hidden}" shows in a session window`);
        }
    });

    it("should show the session's workspace and compute in Connection, and not offer to sign in", async () => {
        const section = (await getViewSection("CONNECTION")) as CustomTreeSection;
        // The connection's row, expanded (it starts collapsed) to its Host, Workspace, User and Auth type, then the session's compute.
        const rows = await browser.waitUntil(
            async () => {
                await expandRows(section);
                const found = await rowTexts(section);
                return found.length >= 6 ? found : false;
            },
            { timeout: 30_000, interval: 1_000, timeoutMsg: "Connection has no rows" },
        );
        assert.strictEqual(rows.length, 6, `Connection shows ${rows.join(", ")}`);
        // No profile: the session's credentials come from its environment, so the row names the host.
        // No Unity Gateway row: it's off in a session window.
        const [label, host] = rows[0]!.split(": ");
        assert.strictEqual(label, "Workspace connection");
        assert.strictEqual(new URL(host!).host, new URL(profileHost()).host);
        const workspace = rows.find((r) => r.startsWith("Host: "));
        assert(workspace, `Connection shows ${rows.join(", ")}`);
        assert.strictEqual(
            new URL(workspace.slice("Host: ".length)).host,
            new URL(profileHost()).host,
        );
        // The ID the host returns: the session's host doesn't have to name its workspace.
        assert(
            rows.some((r) => /^Workspace: \d+$/.test(r)),
            `Connection shows ${rows.join(", ")}`,
        );
        assert.strictEqual(rows.at(-1), "Session compute: Serverless");
        const welcome = await section.findWelcomeContent();
        assert.strictEqual(
            welcome,
            undefined,
            "Connection shows its welcome, with the sign-in button",
        );
    });

    it("should let the folder's bundle run with the session's credentials", async () => {
        const section = (await getViewSection("PROJECT")) as CustomTreeSection;
        // Not every row of the view has a description, so only the Target row's is read.
        const target = async () => {
            for (const item of await section.getVisibleItems()) {
                if ((await item.getLabel()) === "Target") {
                    return item.getDescription();
                }
            }
            return undefined;
        };
        let description: string | undefined;
        try {
            await browser.waitUntil(
                async () => {
                    description = await target();
                    // A paused target would read "dev (paused)".
                    return description === "dev";
                },
                { timeout: 60_000, interval: 2_000 },
            );
        } catch {
            // Not a timeoutMsg: that is built before the first poll.
            throw new Error(`The Project view's target isn't a runnable dev: ${description}`);
        }
    });

    it("should show no compute row in the Project view: the session's compute can't change", async () => {
        const section = (await getViewSection("PROJECT")) as CustomTreeSection;
        const labels = await Promise.all(
            (await section.getVisibleItems()).map((item) => item.getLabel()),
        );
        for (const label of ["Cluster", "Select compute", "Serverless"]) {
            assert(
                !labels.includes(label),
                `The Project view shows "${label}": ${labels.join(", ")}`,
            );
        }
    });

    it("should list the catalogs with the session's credentials", async () => {
        await findUCItem(await getUCSection(), "system");
    });

    it("should make the session's interpreter the active one", async () => {
        // DATABRICKS_VIRTUAL_ENV is the interpreter; ms-python may report it resolved, so match its environment.
        const venv = path.dirname(path.dirname(process.env.DATABRICKS_VIRTUAL_ENV!));
        let active: string | undefined;
        try {
            await browser.waitUntil(
                async () => {
                    active = await browser.executeWorkbench(async (vscode) => {
                        const api = (await vscode.extensions
                            .getExtension("ms-python.python")
                            ?.activate()) as
                            | { environments: { getActiveEnvironmentPath(): { path: string } } }
                            | undefined;
                        return api?.environments.getActiveEnvironmentPath().path;
                    });
                    return (
                        active !== undefined && path.resolve(active).startsWith(path.resolve(venv))
                    );
                },
                { timeout: 60_000, interval: 2_000 },
            );
        } catch {
            // Not a timeoutMsg: that is built before the first poll.
            throw new Error(`The interpreter isn't in ${venv}; it is ${active}`);
        }
    });

    it("should not offer to install the AI tools", async () => {
        // The first-run prompt would have shown by now in a local window.
        await sleep(5_000);
        const messages = await Promise.all(
            (await (await browser.getWorkbench()).getNotifications()).map((n) => n.getMessage()),
        );
        assert(
            !messages.some((m) => m.includes("Install Databricks AI tools?")),
            `The AI tools prompt showed: ${messages.join(" | ")}`,
        );
    });

    it("should refuse to start a tunnel, and say what to do instead", async () => {
        await browser.executeWorkbench(async (vscode) => {
            await vscode.commands.executeCommand("databricks.ssh.startTunnel");
        });
        await browser.waitUntil(
            async () => {
                const messages = await Promise.all(
                    (await (await browser.getWorkbench()).getNotifications()).map((n) =>
                        n.getMessage(),
                    ),
                );
                return messages.some((m) => m.includes("Open a local window (File > New Window)"));
            },
            { timeout: 20_000, interval: 1_000, timeoutMsg: "No notification says what to do" },
        );
    });
});
