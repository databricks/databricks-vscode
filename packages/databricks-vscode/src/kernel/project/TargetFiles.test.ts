import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { useTempDirs } from "../../test-support/tempDir";
import { TargetFiles } from "./TargetFiles";

const tempDir = useTempDirs();
/** Written by the old extension's `OverrideableConfigModel`, plus a key neither knows. */
const golden = fs.readFileSync(path.join(__dirname, "fixtures", "vscode.overrides.json"), "utf-8");

describe("TargetFiles", () => {
    it("reads a file the old extension wrote", async () => {
        const t = tempDir();
        t.write(".databricks/bundle/dev/vscode.overrides.json", golden);
        expect(await new TargetFiles(t.dir).readOverrides("dev")).toEqual({
            authProfile: "DEFAULT",
            clusterId: "0123-456789-abcdefgh",
            useClusterOverride: true,
            serverless: false,
            serverlessVersion: "4",
            someFutureKey: { nested: [1, 2] },
        });
    });

    it("keeps the other keys, in the old format, when it writes one", async () => {
        const t = tempDir();
        const file = t.write(".databricks/bundle/dev/vscode.overrides.json", golden);
        await new TargetFiles(t.dir).writeOverride("dev", "authProfile", "COPY");
        const written = fs.readFileSync(file, "utf-8");
        expect(JSON.parse(written)).toEqual({ ...JSON.parse(golden), authProfile: "COPY" });
        // `JSON.stringify(data, null, 2)`, as the old writer did.
        expect(written).toBe(JSON.stringify(JSON.parse(written), null, 2));
    });

    it("removes a key written as undefined", async () => {
        const t = tempDir();
        t.write(".databricks/bundle/dev/vscode.overrides.json", golden);
        const files = new TargetFiles(t.dir);
        await files.writeOverride("dev", "authProfile", undefined);
        expect(await files.readOverrides("dev")).not.toHaveProperty("authProfile");
    });

    it("creates the file and its folders on the first write", async () => {
        const t = tempDir();
        const files = new TargetFiles(t.dir);
        expect(await files.readOverrides("new")).toEqual({});
        await files.writeOverride("new", "authProfile", "DEFAULT");
        expect(fs.existsSync(t.path(".databricks/bundle/new/vscode.overrides.json"))).toBe(true);
    });

    it("loses no update when writes overlap", async () => {
        const t = tempDir();
        const files = new TargetFiles(t.dir);
        await Promise.all([
            files.writeOverride("dev", "authProfile", "A"),
            files.writeOverride("dev", "clusterId", "c"),
            files.writeOverride("dev", "serverless", true),
        ]);
        expect(await files.readOverrides("dev")).toEqual({
            authProfile: "A",
            clusterId: "c",
            serverless: true,
        });
    });

    it("treats an empty file as no overrides, and rejects one that isn't a JSON object", async () => {
        const t = tempDir();
        t.write(".databricks/bundle/empty/vscode.overrides.json", "");
        t.write(".databricks/bundle/array/vscode.overrides.json", "[]");
        const files = new TargetFiles(t.dir);
        expect(await files.readOverrides("empty")).toEqual({});
        await expect(files.readOverrides("array")).rejects.toThrow(/JSON object/);
    });

    describe("vscode.bundlevars.json", () => {
        it("reads a file the old extension wrote, dropping empty values", async () => {
            const t = tempDir();
            // The old `BundleVariableModel` wrote `JSON.stringify(values, null, 4)`.
            t.write(
                ".databricks/bundle/dev/vscode.bundlevars.json",
                JSON.stringify({ a: "1", b: "", c: 2, d: true, e: { x: 1 } }, null, 4),
            );
            expect(await new TargetFiles(t.dir).readVariables("dev")).toEqual({
                a: "1",
                c: "2",
                d: "true",
            });
        });

        it("reads no overrides without a file, or from an empty one, and rejects one that isn't a JSON object", async () => {
            const t = tempDir();
            const files = new TargetFiles(t.dir);
            expect(await files.readVariables("dev")).toEqual({});
            t.write(".databricks/bundle/empty/vscode.bundlevars.json", "  ");
            expect(await files.readVariables("empty")).toEqual({});
            t.write(".databricks/bundle/array/vscode.bundlevars.json", "[]");
            await expect(files.readVariables("array")).rejects.toThrow(/JSON object/);
        });

        it("creates the file with {} only when it doesn't exist, and deletes it", async () => {
            const t = tempDir();
            const files = new TargetFiles(t.dir);
            const file = await files.ensureVariablesFile("dev");
            expect(file).toBe(t.path(".databricks/bundle/dev/vscode.bundlevars.json"));
            expect(fs.readFileSync(file, "utf-8")).toBe("{}");
            fs.writeFileSync(file, '{"a": "1"}');
            await files.ensureVariablesFile("dev");
            expect(fs.readFileSync(file, "utf-8")).toBe('{"a": "1"}');
            await files.deleteVariables("dev");
            expect(fs.existsSync(file)).toBe(false);
            await files.deleteVariables("dev");
        });

        it("is a separate file from the overrides", async () => {
            const t = tempDir();
            const files = new TargetFiles(t.dir);
            await files.writeOverride("dev", "authProfile", "A");
            await files.ensureVariablesFile("dev");
            await files.deleteVariables("dev");
            expect(await files.readOverrides("dev")).toEqual({ authProfile: "A" });
        });
    });

    it("doesn't read the old root-level overrides file", async () => {
        const t = tempDir();
        t.write(".databricks/bundle/vscode.overrides.json", golden);
        expect(await new TargetFiles(t.dir).readOverrides("dev")).toEqual({});
    });
});
