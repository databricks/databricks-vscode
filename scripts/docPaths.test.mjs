// Every path and link in ARCHITECTURE.md resolves. A path in the extension's
// source is relative to packages/databricks-vscode/src/; any other path, and
// every link, is relative to the repo root (the file's own convention). A
// path that resolves under neither base is dead, and one that resolves under
// both is ambiguous.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(repoDir, "packages/databricks-vscode/src");
const DOC = "ARCHITECTURE.md";

/** Backticked names with a slash that aren't paths: an import pattern and a lint rule. */
const NOT_PATHS = new Set(["/dist/", "import/no-cycle"]);

/** Inline code that looks like a path: it has a slash or a file extension. */
function isPathLike(code) {
    if (NOT_PATHS.has(code) || /[\s<>*…]/.test(code)) {
        return false;
    }
    return code.includes("/") || /\.(ts|mjs|cjs|js|json|md)$/.test(code);
}

/** The inline code spans and link targets outside fenced code blocks, with their line numbers. */
function references(markdown) {
    const found = [];
    let fenced = false;
    markdown.split("\n").forEach((line, i) => {
        if (line.startsWith("```")) {
            fenced = !fenced;
            return;
        }
        if (fenced) {
            return;
        }
        for (const [, code] of line.matchAll(/`([^`]+)`/g)) {
            if (isPathLike(code)) {
                found.push({ line: i + 1, kind: "path", target: code });
            }
        }
        for (const [, target] of line.matchAll(/\]\(([^)\s]+)\)/g)) {
            if (!/^[a-z]+:/.test(target)) {
                found.push({ line: i + 1, kind: "link", target });
            }
        }
    });
    return found;
}

/** GitHub's anchor for a heading: lower case, punctuation dropped, spaces to dashes. */
function anchorOf(heading) {
    return heading
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]/gu, "")
        .replace(/\s/g, "-");
}

function hasAnchor(file, anchor) {
    const headings = fs.readFileSync(file, "utf-8").match(/^#+\s+.*$/gm) ?? [];
    return headings.some((h) => anchorOf(h.replace(/^#+\s+/, "")) === anchor);
}

/** What is wrong with a reference, or undefined. */
function problem(ref, bases = { repo: repoDir, src: srcDir }) {
    if (ref.kind === "link") {
        const [file, anchor] = ref.target.split("#");
        const full = path.join(bases.repo, file);
        if (!fs.existsSync(full)) {
            return "links to a file that doesn't exist";
        }
        return anchor !== undefined && !hasAnchor(full, anchor)
            ? `links to a heading that doesn't exist (#${anchor})`
            : undefined;
    }
    const inRepo = fs.existsSync(path.join(bases.repo, ref.target));
    const inSrc = fs.existsSync(path.join(bases.src, ref.target));
    if (inRepo && inSrc) {
        return "resolves both from the repo root and from packages/databricks-vscode/src/";
    }
    return inRepo || inSrc
        ? undefined
        : "resolves neither from the repo root nor from packages/databricks-vscode/src/";
}

await test(`every path and link in ${DOC} resolves, under one base only`, () => {
    const refs = references(fs.readFileSync(path.join(repoDir, DOC), "utf-8"));
    assert.ok(refs.length > 20, `found only ${refs.length} references; is the parser broken?`);
    const problems = refs.flatMap((ref) => {
        const p = problem(ref);
        return p === undefined ? [] : [`${DOC}:${ref.line} \`${ref.target}\` ${p}`];
    });
    assert.deepEqual(problems, []);
});

await test("reports a dead path, an ambiguous one, a dead link and a missing heading", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "doc-paths-"));
    const src = path.join(repo, "packages/databricks-vscode/src");
    const write = (file, text = "") => {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, text);
    };
    write(path.join(repo, "AGENTS.md"), "# Agents\n\n## Hard rules\n");
    write(path.join(repo, "both.ts"));
    write(path.join(src, "both.ts"));
    write(path.join(src, "platform/process.ts"));
    try {
        const refs = references(
            [
                "`platform/process.ts`, `platform/nowhere.ts`, `both.ts`, `features/<name>/` and `/dist/`",
                "[a](AGENTS.md#hard-rules) [b](AGENTS.md#no-such-heading) [c](missing.md) [d](https://example.com)",
                "```text",
                "`ignored/inside/a/fence.ts`",
                "```",
            ].join("\n"),
        );
        assert.deepEqual(
            refs.map((r) => [r.target, problem(r, { repo, src })]),
            [
                ["platform/process.ts", undefined],
                [
                    "platform/nowhere.ts",
                    "resolves neither from the repo root nor from packages/databricks-vscode/src/",
                ],
                [
                    "both.ts",
                    "resolves both from the repo root and from packages/databricks-vscode/src/",
                ],
                ["AGENTS.md#hard-rules", undefined],
                [
                    "AGENTS.md#no-such-heading",
                    "links to a heading that doesn't exist (#no-such-heading)",
                ],
                ["missing.md", "links to a file that doesn't exist"],
            ],
        );
    } finally {
        fs.rmSync(repo, { recursive: true, force: true });
    }
});
