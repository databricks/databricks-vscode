import path from "node:path";
import { describe, expect, it } from "vitest";
import { fakeSettings } from "../test-support/fakes";
import { resolveSystemVariables, setting, settingId, Settings } from "./settings";

describe("resolveSystemVariables", () => {
    it("interpolates the known variables", () => {
        const root = path.resolve("workspacePath");
        for (const name of ["workspaceRoot", "workspaceFolder", "cwd"]) {
            expect(resolveSystemVariables(path.join(`\${${name}}`, "test"), root)).toBe(
                path.join(root, "test"),
            );
        }
    });

    it("leaves unknown variables alone", () => {
        const value = path.join("${unknown}", "test");
        expect(resolveSystemVariables(value, "/root")).toBe(value);
    });

    it("interpolates every occurrence", () => {
        expect(resolveSystemVariables("${cwd}:${workspaceFolder}", "/w")).toBe("/w:/w");
    });
});

describe("Settings", () => {
    const CLI_PATH = setting<string | undefined>(
        "databricks",
        "overrideDatabricksCLIPath",
        undefined,
    );
    const ENABLED = setting("databricks", "test.enabled", true);

    it("reads the value, falling back to the default", () => {
        const settings = fakeSettings({ "databricks.overrideDatabricksCLIPath": "/bin/db" });
        expect(settings.get(CLI_PATH)).toBe("/bin/db");
        expect(settings.get(ENABLED)).toBe(true);
    });

    it("says whether the user set a value at any scope, not whether it differs from the default", () => {
        const STRICT = setting<boolean | null>("databricks", "proxy.strictSSL", null);
        const settings = (inspected: Record<string, unknown> | undefined) =>
            new Settings({
                // `get` returns the default here; `isSetByUser` must not read it.
                getConfiguration: () => ({
                    get: () => false,
                    inspect: () => inspected,
                    update: async () => {},
                }),
                onDidChangeConfiguration: () => ({ dispose: () => {} }),
            });
        expect(settings(undefined).isSetByUser(STRICT)).toBe(false);
        expect(settings({}).isSetByUser(STRICT)).toBe(false);
        expect(settings({ globalValue: true }).isSetByUser(STRICT)).toBe(true);
        expect(settings({ globalValue: false }).isSetByUser(STRICT)).toBe(true);
        expect(settings({ workspaceValue: false }).isSetByUser(STRICT)).toBe(true);
        expect(settings({ workspaceFolderValue: false }).isSetByUser(STRICT)).toBe(true);
        expect(settings({ globalValue: null, workspaceValue: "" }).isSetByUser(STRICT)).toBe(false);
    });

    it("notifies only about the setting it watches", () => {
        let listener: ((e: { affectsConfiguration(id: string): boolean }) => void) | undefined;
        const settings = new Settings({
            getConfiguration: () => ({
                get: () => undefined,
                inspect: () => undefined,
                update: async () => {},
            }),
            onDidChangeConfiguration: (l) => {
                listener = l;
                return { dispose: () => {} };
            },
        });
        let fired = 0;
        settings.onDidChange(ENABLED, () => fired++);
        listener?.({ affectsConfiguration: (id) => id === settingId(ENABLED) });
        listener?.({ affectsConfiguration: (id) => id === "databricks.other" });
        expect(fired).toBe(1);
    });
});
