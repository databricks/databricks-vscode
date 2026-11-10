import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { StateStore } from "../../../platform/state";
import { fakeMemento, fakeSettings } from "../../../test-support/fakes";
import { useTempDirs } from "../../../test-support/tempDir";
import {
    Autocomplete,
    BUILTINS_STUB,
    CANCEL,
    CONTINUE,
    NEVER_FOR_THIS_WORKSPACE,
    SKIP_CONFIGURE,
} from "./Autocomplete";

const tempDir = useTempDirs();
const STUB = path.resolve(__dirname, "../../../..", BUILTINS_STUB);

function setup(options: { choice?: string; stubPath?: string; stubSource?: string } = {}) {
    const t = tempDir();
    const root = t.path("workspace");
    fs.mkdirSync(root);
    const state = new StateStore({ global: fakeMemento(), workspace: fakeMemento() });
    const prompts: { message: string; items: string[] }[] = [];
    const a = new Autocomplete({
        stubSource: options.stubSource ?? STUB,
        workspaceFolder: () => root,
        settings: fakeSettings(
            options.stubPath === undefined ? {} : { "python.analysis.stubPath": options.stubPath },
        ),
        state,
        showInformationMessage: async (message, ...items) => {
            prompts.push({ message, items });
            return options.choice;
        },
    });
    let updates = 0;
    a.onDidUpdate(() => updates++);
    return { t, root, a, state, prompts, updates: () => updates };
}

describe("Autocomplete", () => {
    it("ships the stub of the Databricks globals", () => {
        const stub = fs.readFileSync(STUB, "utf-8");
        expect(stub).toContain("from databricks.sdk.runtime import *");
        expect(stub).toContain("spark: SparkSession");
    });

    it("puts __builtins__.pyi in the workspace folder, or under python.analysis.stubPath", () => {
        expect(setup().a.builtinsPath).toMatch(/workspace[\\/]__builtins__\.pyi$/);
        expect(setup({ stubPath: "typings" }).a.builtinsPath).toMatch(
            /workspace[\\/]typings[\\/]__builtins__\.pyi$/,
        );
    });

    it("asks before appending the stub, and then no longer needs to", async () => {
        const s = setup({ choice: CONTINUE });
        s.t.write("workspace/__builtins__.pyi", "import mine\n");
        expect(await s.a.shouldSetupBuiltins()).toBe(true);
        await s.a.configure();
        expect(s.prompts).toEqual([
            {
                message: `Create ${s.a.builtinsPath}?`,
                items: [CONTINUE, CANCEL, NEVER_FOR_THIS_WORKSPACE],
            },
        ]);
        const content = fs.readFileSync(s.a.builtinsPath, "utf-8");
        expect(content.startsWith("import mine\n\n")).toBe(true);
        expect(content).toContain(fs.readFileSync(STUB, "utf-8"));
        expect(await s.a.shouldSetupBuiltins()).toBe(false);
        expect(s.updates()).toBe(1);

        // Already there: nothing to ask.
        await s.a.configure();
        expect(s.prompts).toHaveLength(1);
    });

    it("writes nothing when cancelled", async () => {
        const s = setup({ choice: CANCEL });
        await s.a.configure();
        expect(fs.existsSync(s.a.builtinsPath)).toBe(false);
        expect(s.updates()).toBe(0);
    });

    it('remembers "Never for this workspace", which configure clears', async () => {
        const s = setup({ choice: NEVER_FOR_THIS_WORKSPACE });
        await s.a.configure();
        expect(s.state.get(SKIP_CONFIGURE)).toBe(true);
        expect(await s.a.shouldSetupBuiltins()).toBe(false);
        expect(s.updates()).toBe(1);
        await s.a.configure();
        expect(s.prompts).toHaveLength(2);
    });

    it("writes to an absolute python.analysis.stubPath as it is, and never changes the setting", async () => {
        const t = tempDir();
        const stubs = t.path("shared-stubs");
        const s = setup({ choice: CONTINUE, stubPath: stubs });
        expect(s.a.builtinsPath).toBe(path.join(stubs, "__builtins__.pyi"));
        await s.a.configure();
        expect(fs.readFileSync(path.join(stubs, "__builtins__.pyi"), "utf-8")).toContain(
            "from databricks.sdk.runtime import *",
        );
        // Nothing was created under the workspace folder.
        expect(fs.readdirSync(s.root)).toEqual([]);
    });

    it("fails when the stub can't be read", async () => {
        const s = setup({ stubSource: "/nonexistent/__builtins__.pyi" });
        await expect(s.a.shouldSetupBuiltins()).rejects.toThrow(
            "Can't read internal type stubs for autocompletion.",
        );
    });
});
