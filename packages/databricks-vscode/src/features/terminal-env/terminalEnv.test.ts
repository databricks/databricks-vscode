import { describe, expect, it } from "vitest";
import { registerFeatures } from "../../kernel/feature";
import { memoryTerminalEnv } from "../../platform/terminalEnv";
import { fakeFeatureHost, fakeKernel } from "../../test-support/fakes";
import { terminalEnv } from "./index";
import { applyTerminalEnvironment, terminalEnvironment } from "./terminalEnvironment";

const extension = {
    version: "2.20.0",
    asAbsolutePath: (p: string) => `/extension/${p.replace(/^\.\//, "")}`,
};

describe("the terminals' environment (INFRA-02)", () => {
    it("is the bundled CLI on PATH and the upstream tag, without Terraform (golden)", () => {
        expect(terminalEnvironment(extension, ":")).toEqual([
            { kind: "append", name: "PATH", value: ":/extension/bin" },
            {
                kind: "replace",
                name: "DATABRICKS_CLI_UPSTREAM",
                value: "databricks-vscode-terminal",
            },
            { kind: "replace", name: "DATABRICKS_CLI_UPSTREAM_VERSION", value: "2.20.0" },
        ]);
        expect(terminalEnvironment(extension, ";")[0]!.value).toBe(";/extension/bin");
    });

    it("replaces what the collection held, and isn't persisted", () => {
        const collection = memoryTerminalEnv();
        // A variable the old extension set, restored from its last session.
        collection.replace("DATABRICKS_TF_VERSION", "1.5.5");
        applyTerminalEnvironment(collection, terminalEnvironment(extension, ":"));
        expect(collection.persistent).toBe(false);
        expect(collection.description).toBe("Adds the bundled Databricks CLI to PATH.");
        expect(Object.fromEntries(collection.variables)).toEqual({
            PATH: { kind: "append", value: ":/extension/bin" },
            DATABRICKS_CLI_UPSTREAM: { kind: "replace", value: "databricks-vscode-terminal" },
            DATABRICKS_CLI_UPSTREAM_VERSION: { kind: "replace", value: "2.20.0" },
        });
    });

    it("is set when the feature registers", () => {
        const collection = memoryTerminalEnv();
        const kernel = fakeKernel({ terminalEnvironment: collection });
        registerFeatures([terminalEnv], fakeFeatureHost(kernel).host);
        expect(collection.variables.get("DATABRICKS_CLI_UPSTREAM")?.value).toBe(
            "databricks-vscode-terminal",
        );
    });
});
