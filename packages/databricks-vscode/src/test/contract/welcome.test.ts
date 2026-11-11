/**
 * The welcome content contract (SHELL-02, SHELL-04): every entry of
 * the old extension's `viewsWelcome` is still there, with the same text and
 * when-clause, or is listed here as changed with the reason.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import oldManifest from "./oldManifest.json";

interface Welcome {
    view: string;
    contents: string;
    when?: string;
}

const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../../package.json"), "utf-8"),
) as {
    contributes: { viewsWelcome: Welcome[] };
};

/** VS Code shows a view's welcome content until its first rows arrive. */
const HIDDEN_BESIDE_ROWS =
    "Hidden while the view has rows: otherwise it shows for a moment before them on a first expand.";

/** Old entries that changed, by the start of their text, with the reason, what replaced them and where, when not in the old view. */
const CHANGED: Record<string, { reason: string; replacement?: string; view?: string }> = {
    "Multiple Databricks projects were detected in the workspace:": {
        reason: `${HIDDEN_BESIDE_ROWS} It said "Multiple", which is wrong for one project.`,
        replacement: "Choose a Databricks project from a subfolder of the open folder:",
    },
    "A Databricks project was not detected in the workspace:": {
        reason: "It said no project was detected in the workspace, though only the open folder and its subfolders are searched. It now names what was searched, the folders skipped, and how to use a bundle elsewhere.",
        replacement: "No bundle (databricks.yml) was found in the open folder or its subfolders,",
    },
    "Loading configuration": {
        reason: HIDDEN_BESIDE_ROWS,
        replacement: "Loading configuration",
    },
    "Databricks project configuration was not detected": {
        reason: "The project.json migration is dropped; a notice links to the docs instead.",
        replacement: "This folder has a Databricks project configuration",
    },
    "[Create a new Databricks project]": {
        reason: "Not offered in a session window, which has no new projects, as in 2.x's remote mode: its when-clause hides it there.",
        replacement: "[Create a new Databricks project](command:databricks.bundle.initNewProject)",
    },
    "Select a folder where you want to create a new Databricks project": {
        reason: "Not offered in a session window, which has no new projects: its when-clause hides it there.",
    },
    "This folder is empty.": {
        reason: "Wrong when no folder is open; the button stays.",
        replacement: "[Open folder](command:vscode.openFolder)",
    },
    "To learn more about how to use the Databricks extension": {
        reason: `${HIDDEN_BESIDE_ROWS} The links are inline, as in 2.x: on their own lines they render as buttons.`,
        replacement:
            "To learn more about how to use the Databricks extension for Visual Studio Code [read our docs]",
        view: "signInView",
    },
};

/** Context keys the rewrite renamed, old to new (`kernel/contextKeys.ts`). */
const RENAMED_CONTEXT_KEYS: Record<string, string> = {
    "databricks.context.isBundleProject": "databricks.context.project",
};

const renamed = (when: string) =>
    Object.entries(RENAMED_CONTEXT_KEYS).reduce((w, [from, to]) => w.replaceAll(from, to), when);
const key = (w: Welcome) => `${w.view}\n${renamed(w.when ?? "")}\n${w.contents}`;

const signInEntries = () =>
    manifest.contributes.viewsWelcome.filter((w) => w.view === "signInView");

describe("welcome content", () => {
    const current = new Set(manifest.contributes.viewsWelcome.map(key));

    it("offers opening a folder and creating a project in an empty window, and leaves switching the connection to the Connection view", () => {
        const noFolder = manifest.contributes.viewsWelcome
            .filter(
                (w) =>
                    w.view === "configurationView" &&
                    w.when?.startsWith("workspaceFolderCount == 0"),
            )
            .map((w) => w.contents);
        expect(noFolder).toEqual([
            "To learn more about [Declarative Automation Bundles](https://docs.databricks.com/dev-tools/vscode-ext/bundles).",
            "[Open folder](command:vscode.openFolder)",
            "[Create a new Databricks project](command:databricks.bundle.initNewProject)",
        ]);
    });

    it("keeps the new-project entries' local when-clauses as they were, plus the session hide", () => {
        const KEY = "!databricks.context.host.noNewProjects";
        for (const start of [
            "[Create a new Databricks project]",
            "Select a folder where you want to create a new Databricks project",
        ]) {
            const old = (oldManifest.viewsWelcome as Welcome[]).find((w) =>
                w.contents.startsWith(start),
            );
            const now = manifest.contributes.viewsWelcome.find((w) => w.contents.startsWith(start));
            expect(now?.when, start).toBe(`${renamed(old?.when ?? "")} && ${KEY}`);
        }
    });

    it("hides the welcome content that can show beside a view's rows while the view has rows", () => {
        // Every Connection entry, and the two Project entries that need a project: Project has rows only with one open.
        const besideRows = manifest.contributes.viewsWelcome.filter(
            (w) =>
                w.view === "signInView" ||
                w.contents.startsWith("Choose a Databricks project from a subfolder") ||
                w.contents === "Loading configuration",
        );
        expect(besideRows).toHaveLength(8);
        for (const w of besideRows) {
            expect(w.when, w.contents).toContain(`!databricks.context.${w.view}.hasRows`);
        }
    });

    it("keeps the Sign-in view's links inline, since a link on a line of its own renders as a button", () => {
        // Only the sign-in button's own line may be a link alone; every other line of every entry is text.
        const signInEntries = manifest.contributes.viewsWelcome.filter(
            (w) => w.view === "signInView",
        );
        const linkOnlyLines = signInEntries.flatMap((w) =>
            w.contents
                .split("\n")
                .filter((line) => !line.includes("command:databricks.connection.configureLogin"))
                .filter((line) => /^\[[^\]]+\]\([^)]+\)$/.test(line.trim())),
        );
        expect(linkOnlyLines).toEqual([]);
    });

    it("keeps the Quickstart guide link in its sentence", () => {
        const sentence = signInEntries().find((w) => w.contents.includes("[Quickstart guide]"));
        expect(sentence?.contents).toContain(
            "[Quickstart guide](command:databricks.quickstart.open)",
        );
        expect(
            sentence?.contents
                .split("\n")
                .some(
                    (line) =>
                        line.trim() === "[Quickstart guide](command:databricks.quickstart.open)",
                ),
        ).toBe(false);
    });

    it("says what signing in gives, before the sign-in button, in the signed-out Connection view", () => {
        const signedOut = manifest.contributes.viewsWelcome.filter(
            (w) =>
                w.view === "signInView" &&
                w.when?.startsWith(
                    "!databricks.context.connected && !databricks.context.host.fixedIdentity",
                ),
        );
        expect(signedOut.map((w) => w.contents)).toEqual([
            "Sign in to use your Databricks workspace in VS Code, and Databricks models in VS Code Chat.",
            "Sign in to use your Databricks workspace in VS Code.",
            "[Sign in to Databricks](command:databricks.connection.configureLogin)",
        ]);
    });

    it("shows the sentence without models only where Unity Gateway is unavailable", () => {
        const plain = manifest.contributes.viewsWelcome.find(
            (w) => w.contents === "Sign in to use your Databricks workspace in VS Code.",
        );
        expect(plain?.when).toContain("databricks.context.unityGateway.unavailable");
        expect(plain?.when).not.toContain("!databricks.context.unityGateway.unavailable");
    });

    it("mentions models only where Unity Gateway is available (not in Cursor)", () => {
        const withModels = manifest.contributes.viewsWelcome.filter((w) =>
            w.contents.includes("models"),
        );
        expect(withModels.length).toBeGreaterThan(0);
        for (const w of withModels) {
            expect(w.when, w.contents).toContain("!databricks.context.unityGateway.unavailable");
        }
    });

    it("keeps each old entry, or lists it as changed", () => {
        const missing = (oldManifest.viewsWelcome as Welcome[])
            .filter((w) => !current.has(key(w)))
            .filter((w) => !Object.keys(CHANGED).some((start) => w.contents.startsWith(start)));
        expect(missing).toEqual([]);
    });

    it("lists only entries that did change, and has their replacements", () => {
        for (const [start, { replacement, view }] of Object.entries(CHANGED)) {
            const old = (oldManifest.viewsWelcome as Welcome[]).filter((w) =>
                w.contents.startsWith(start),
            );
            expect(old.length, start).toBe(1);
            expect(current.has(key(old[0]!)), `${start} is unchanged`).toBe(false);
            if (replacement !== undefined) {
                expect(
                    manifest.contributes.viewsWelcome.some(
                        (w) =>
                            w.view === (view ?? old[0]!.view) && w.contents.startsWith(replacement),
                    ),
                    replacement,
                ).toBe(true);
            }
        }
    });
});
