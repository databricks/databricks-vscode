/**
 * The walkthrough contract: its command links, when-clauses and media paths.
 * `manifest.test.ts` checks the commands, menus and views, not walkthroughs.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FEATURES } from "../../features";
import { SHELL_CONTEXT_KEYS } from "../../kernel/contextKeys";
import { QUICKSTART_WALKTHROUGH } from "../../features/onboarding/commands";

const packageDir = path.resolve(__dirname, "../../..");
const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf-8")) as {
    contributes: {
        commands: { command: string }[];
        views?: Record<string, { id: string }[]>;
        walkthroughs?: {
            id: string;
            when?: string;
            steps: {
                id: string;
                description: string;
                when?: string;
                media: { image?: string; altText?: string; markdown?: string };
            }[];
        }[];
    };
};

/** VS Code's own commands that a walkthrough may link to. */
const BUILT_IN_COMMANDS = new Set(["vscode.openFolder"]);

const walkthroughs = manifest.contributes.walkthroughs ?? [];
const commands = new Set(manifest.contributes.commands.map((c) => c.command));
/** VS Code registers `<viewId>.focus` for every contributed view. */
const viewFocusCommands = new Set(
    Object.values(manifest.contributes.views ?? {})
        .flat()
        .map((v) => `${v.id}.focus`),
);

/** Each step's text. Its media is a video, which has no text pane, so the text is the description. */
function stepTexts(): { step: string; text: string }[] {
    return walkthroughs.flatMap((w) =>
        w.steps.map((s) => ({ step: `${w.id}/${s.id}`, text: s.description })),
    );
}

describe("walkthroughs", () => {
    it("is opened by the id the command uses, publisher.name#id", () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf-8")) as {
            publisher: string;
            name: string;
        };
        const id = `${pkg.publisher}.${pkg.name}#${walkthroughs[0]!.id}`;
        expect(id).toBe(QUICKSTART_WALKTHROUGH);
    });

    it("is hidden in session windows, which set remoteName from the start", () => {
        // Before activation no host key is set, and VS Code opens a walkthrough on install
        // when its `when` matches, so the guard uses the workbench's remoteName.
        expect(walkthroughs[0]!.when).toBe("!remoteName");
    });

    it("has the getStarted walkthrough with its steps", () => {
        // A new id, so VS Code opens it on install for users who saw the old one.
        expect(walkthroughs.map((w) => w.id)).toEqual(["getStarted"]);
        expect(walkthroughs[0]!.steps.map((s) => s.id)).toEqual([
            "connect",
            "explore",
            "models",
            "ai-tools",
            "tunnel",
            "deploy",
        ]);
    });

    it("links only to contributed commands or VS Code's built-ins", () => {
        const links = stepTexts().flatMap(({ step, text }) =>
            [...text.matchAll(/\(command:([^)?\s]+)/g)].map((m) => ({ step, command: m[1]! })),
        );
        expect(links.length).toBeGreaterThan(0);
        const unknown = links.filter(
            ({ command }) =>
                !commands.has(command) &&
                !BUILT_IN_COMMANDS.has(command) &&
                !viewFocusCommands.has(command),
        );
        expect(unknown).toEqual([]);
    });

    it("uses only declared context keys in its when-clauses", () => {
        const declared = new Set([
            ...SHELL_CONTEXT_KEYS.map((k) => k.name),
            ...FEATURES.flatMap((f) => f.contextKeys ?? []).map((k) => k.name),
        ]);
        const whens = [
            ...walkthroughs.map((w) => w.when),
            ...walkthroughs.flatMap((w) => w.steps.map((s) => s.when)),
        ].filter((w): w is string => w !== undefined);
        expect(whens.length).toBeGreaterThan(0);
        const used = whens.flatMap((w) =>
            [...w.matchAll(/(?<![\w.])databricks\.[\w.-]+/g)].map((m) => m[0]),
        );
        expect(used.filter((k) => !declared.has(k))).toEqual([]);
    });

    it("gives each step a video with a title, both packaged with resources/", () => {
        // Markdown media, since `image` takes no video; a GIF of the same recording is 2 to 7 times bigger.
        // Markdown media has no altText, so the video's title names it.
        for (const w of walkthroughs) {
            for (const s of w.steps) {
                expect(s.media.markdown, s.id).toMatch(/^resources\/walkthrough\/[\w-]+\.md$/);
                expect(s.media.image, s.id).toBeUndefined();
                const md = fs.readFileSync(path.join(packageDir, s.media.markdown!), "utf-8");
                const video =
                    /^<video src="([\w-]+\.mp4)" title="([^"]+)" autoplay loop muted playsinline width="100%"><\/video>\n$/.exec(
                        md,
                    );
                expect(video, s.id).not.toBeNull();
                expect(
                    fs.existsSync(path.join(packageDir, "resources/walkthrough", video![1]!)),
                    s.id,
                ).toBe(true);
            }
        }
    });

    it("puts a step's docs link, when it has one, before its buttons", () => {
        const withDocs = stepTexts().flatMap(({ step, text }) => {
            const docs = text
                .split("\n")
                .find((line) => /\]\(https:\/\/docs\.databricks\.com\//.test(line));
            return docs === undefined ? [] : [{ step, text, docs }];
        });
        expect(withDocs.length).toBeGreaterThan(0);
        for (const { step, text, docs } of withDocs) {
            // Command links (the buttons) come after it.
            expect(text.indexOf(docs), step).toBeLessThan(text.indexOf("(command:"));
        }
    });
});
