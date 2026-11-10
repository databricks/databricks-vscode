/**
 * The import rules, in `.dependency-cruiser.cjs` (package
 * root). dependency-cruiser checks resolved paths: `../../kernel/x` from a
 * feature and `../kernel/x` from platform are the same layer. A fixture tree
 * breaks each rule once, so a rule that stops matching fails here too.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const packageDir = path.resolve(__dirname, "../../..");
const configFile = path.join(packageDir, ".dependency-cruiser.cjs");

interface Cruise {
    modules: number;
    /** `from → to: rule`, paths relative to the cruised root. */
    violations: string[];
    rules: Map<string, string>;
}

/** Cruises `src/` under `baseDir` with the package's rules. */
async function cruise(baseDir: string): Promise<Cruise> {
    const { cruise: run } = await import("dependency-cruiser");
    const { default: extractOptions } =
        await import("dependency-cruiser/config-utl/extract-depcruise-options");
    const options = await extractOptions(configFile);
    const { output } = await run(["src"], { ...options, baseDir });
    if (typeof output === "string") {
        throw new Error(`dependency-cruiser returned a report instead of a result: ${output}`);
    }
    return {
        modules: output.modules.length,
        violations: output.summary.violations.map((v) => `${v.from} → ${v.to}: ${v.rule.name}`),
        rules: new Map(
            (options.ruleSet?.forbidden ?? []).map((rule) => [rule.name ?? "", rule.comment ?? ""]),
        ),
    };
}

/** Each fixture file, and the rule it breaks (undefined: allowed). */
const FIXTURES: { file: string; source: string; breaks?: string }[] = [
    // Import targets.
    { file: "src/extension.ts", source: `import "./features/one/f"; import "./kernel/k";` },
    { file: "src/kernel/k.ts", source: `import "../platform/p";` },
    { file: "src/platform/p.ts", source: `` },
    {
        file: "src/platform/process.ts",
        source: `import {spawn} from "node:child_process"; export {spawn};`,
    },
    {
        file: "src/platform/workspace.ts",
        source: `import * as vscode from "vscode"; export {vscode};`,
    },
    {
        file: "src/features/one/f.ts",
        source: `import "../../kernel/k"; import "../../platform/p"; import {window} from "vscode"; export {window};`,
    },
    { file: "src/features/two/g.ts", source: `` },
    { file: "src/test-support/fake.ts", source: `` },

    // Allowed.
    {
        file: "src/platform/typeOnly.ts",
        source: `import type {Uri} from "vscode"; export type A = Uri;`,
    },
    {
        file: "src/platform/inlineTypeOnly.ts",
        source: `import {type Uri} from "vscode"; export type B = Uri;`,
    },
    {
        file: "src/features/one/f.test.ts",
        source: `import "../two/g"; import "../../test-support/fake"; import "../../extension"; import "node:child_process";`,
    },
    {
        file: "src/kernel/cli/commands/environments.test.ts",
        source: `import "../../../features/one/f";`,
    },

    // Broken.
    {
        file: "src/platform/toKernel.ts",
        source: `import "../kernel/k";`,
        breaks: "platform-is-bottom",
    },
    {
        file: "src/kernel/toFeature.ts",
        source: `import "../features/one/f";`,
        breaks: "kernel-below-features",
    },
    {
        file: "src/features/one/a/b/c/d/e/toOther.ts",
        source: `import "../../../../../../two/g";`,
        breaks: "features-apart",
    },
    {
        file: "src/kernel/typeVscode.ts",
        source: `import type {Uri} from "vscode"; export type C = Uri;`,
        breaks: "kernel-without-vscode",
    },
    {
        file: "src/platform/runtimeVscode.ts",
        source: `import {window} from "vscode"; export {window};`,
        breaks: "vscode-only-in-adapters",
    },
    {
        file: "src/kernel/toAdapter.ts",
        source: `import "../platform/workspace";`,
        breaks: "adapters-only-from-above",
    },
    {
        file: "src/features/one/toFake.ts",
        source: `import "../../test-support/fake";`,
        breaks: "test-support-only-in-tests",
    },
    {
        file: "src/features/one/toBootstrap.ts",
        source: `import "../../extension";`,
        breaks: "bootstrap-only-from-root",
    },
    {
        file: "src/features/one/spawns.ts",
        source: `import {execFile} from "node:child_process"; export {execFile};`,
        breaks: "spawn-only-in-process",
    },
    {
        file: "src/kernel/spawns.ts",
        source: `import * as cp from "child_process"; export {cp};`,
        breaks: "spawn-only-in-process",
    },
];

/** A tree of FIXTURES, with the real @types/vscode for `vscode` to resolve to. */
function writeFixtures(): string {
    const dir = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), "databricks-vscode-boundaries-")),
    );
    for (const { file, source } of FIXTURES) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), source);
    }
    const vscodeTypes = path.dirname(
        createRequire(__filename).resolve("@types/vscode/package.json"),
    );
    fs.mkdirSync(path.join(dir, "node_modules/@types"), { recursive: true });
    fs.symlinkSync(vscodeTypes, path.join(dir, "node_modules/@types/vscode"), "dir");
    return dir;
}

describe("import boundaries", () => {
    let real: Cruise;
    let fixtureDir: string;
    let fixture: Cruise;

    beforeAll(async () => {
        fixtureDir = writeFixtures();
        [real, fixture] = await Promise.all([cruise(packageDir), cruise(fixtureDir)]);
    });

    afterAll(() => {
        fs.rmSync(fixtureDir, { recursive: true, force: true });
    });

    it("finds the source files", () => {
        expect(real.modules).toBeGreaterThan(10);
    });

    it("keeps platform → kernel → features layering, and features apart", () => {
        const problems = real.violations.map(
            (v) => `${v} (${real.rules.get(v.split(": ").at(-1)!)})`,
        );
        expect(problems).toEqual([]);
    });

    it("detects a violation of every rule", () => {
        const broken = FIXTURES.filter((f) => f.breaks !== undefined);
        expect(new Set(broken.map((f) => f.breaks))).toEqual(new Set(fixture.rules.keys()));
        for (const { file, breaks } of broken) {
            expect(
                fixture.violations
                    .filter((v) => v.startsWith(`${file} → `))
                    .map((v) => v.split(": ").at(-1)),
                file,
            ).toEqual([breaks]);
        }
    });

    it("allows type-only vscode in platform, the adapters, the layers below, and tests", () => {
        const allowed = new Set(FIXTURES.filter((f) => f.breaks === undefined).map((f) => f.file));
        expect(fixture.violations.filter((v) => allowed.has(v.split(" → ")[0]!))).toEqual([]);
    });
});
