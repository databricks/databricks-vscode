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
        walkthroughs?: {
            id: string;
            when?: string;
            steps: {
                id: string;
                description: string;
                when?: string;
                media: { markdown?: string };
            }[];
        }[];
    };
};

/** VS Code's own commands that a walkthrough may link to. */
const BUILT_IN_COMMANDS = new Set(["vscode.openFolder"]);

const walkthroughs = manifest.contributes.walkthroughs ?? [];
const commands = new Set(manifest.contributes.commands.map((c) => c.command));

/** Each step's text and its markdown media. */
function stepTexts(): { step: string; text: string }[] {
    return walkthroughs.flatMap((w) =>
        w.steps.map((s) => {
            const markdown = s.media.markdown
                ? fs.readFileSync(path.join(packageDir, s.media.markdown), "utf-8")
                : "";
            return { step: `${w.id}/${s.id}`, text: `${s.description}\n${markdown}` };
        }),
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

    it("has the quickstart walkthrough with its steps", () => {
        expect(walkthroughs.map((w) => w.id)).toEqual(["quickstart"]);
        expect(walkthroughs[0]!.steps.length).toBeGreaterThanOrEqual(3);
        expect(walkthroughs[0]!.steps.length).toBeLessThanOrEqual(6);
    });

    it("links only to contributed commands or VS Code's built-ins", () => {
        const links = stepTexts().flatMap(({ step, text }) =>
            [...text.matchAll(/\(command:([^)?\s]+)/g)].map((m) => ({ step, command: m[1]! })),
        );
        expect(links.length).toBeGreaterThan(0);
        const unknown = links.filter(
            ({ command }) => !commands.has(command) && !BUILT_IN_COMMANDS.has(command),
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

    it("points each step's media at a markdown file that exists", () => {
        for (const w of walkthroughs) {
            for (const s of w.steps) {
                expect(s.media.markdown, s.id).toBeDefined();
                expect(fs.existsSync(path.join(packageDir, s.media.markdown!)), s.id).toBe(true);
            }
        }
    });
});
