import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import { MutableState, when } from "../../platform/reactive";
import { environmentOf, PROBE_ENV, PROBE_SETTINGS } from "../../test-support/childEnvironment";
import { fakeFeatureHost, fakeKernel, fakeLog, fakeSettings } from "../../test-support/fakes";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode, Uri } from "../../test-support/vscode";
import {
    loadBundleSchema,
    registerSchemaContributor,
    ROOT_SCHEMA_URI,
    type YamlExtensionApi,
} from "./BundleSchema";
import { YAML } from "../../kernel/extensionDependencies";
import { bundleYaml } from "./index";

const tempDir = useTempDirs();
const SCHEMA = JSON.stringify({
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
});

beforeEach(() => vscode.reset());

describe("loadBundleSchema (BNDL-04)", () => {
    const deps = (dir: string, version: string | undefined) => {
        const generate = vi.fn(async () => SCHEMA);
        return {
            generate,
            deps: { cliVersion: async () => version, generate, cacheDir: dir, log: fakeLog() },
        };
    };

    it("runs bundle schema once per CLI version", async () => {
        const t = tempDir();
        const first = deps(t.dir, "1.19.0");
        expect(await loadBundleSchema(first.deps)).toBe(SCHEMA);
        const second = deps(t.dir, "1.19.0");
        expect(await loadBundleSchema(second.deps)).toBe(SCHEMA);
        expect(first.generate).toHaveBeenCalledOnce();
        expect(second.generate).not.toHaveBeenCalled();
        expect(fs.readdirSync(t.dir)).toEqual(["bundle-schema-1.19.0.json"]);
    });

    it("generates it again for another version, and keeps only that one", async () => {
        const t = tempDir();
        await loadBundleSchema(deps(t.dir, "1.19.0").deps);
        const next = deps(t.dir, "1.20.0");
        await loadBundleSchema(next.deps);
        expect(next.generate).toHaveBeenCalledOnce();
        expect(fs.readdirSync(t.dir)).toEqual(["bundle-schema-1.20.0.json"]);
    });

    it("doesn't cache a dev build or an unknown version", async () => {
        for (const version of ["0.0.0-dev+abc", undefined]) {
            const t = tempDir();
            const d = deps(t.dir, version);
            await loadBundleSchema(d.deps);
            await loadBundleSchema(d.deps);
            expect(d.generate).toHaveBeenCalledTimes(2);
            expect(fs.readdirSync(t.dir)).toEqual([]);
        }
    });

    it("replaces a damaged cache file", async () => {
        const t = tempDir();
        t.write("bundle-schema-1.19.0.json", "{not json");
        const d = deps(t.dir, "1.19.0");
        expect(await loadBundleSchema(d.deps)).toBe(SCHEMA);
        expect(fs.readFileSync(t.path("bundle-schema-1.19.0.json"), "utf-8")).toBe(SCHEMA);
    });
});

describe("registerSchemaContributor", () => {
    it("maps the bundle's files, read at each request, to the schema", () => {
        let contributor!: Parameters<YamlExtensionApi["registerContributor"]>;
        const api: YamlExtensionApi = {
            registerContributor: (...args) => ((contributor = args), true),
        };
        const files = ["/w/databricks.yml"];
        registerSchemaContributor(
            api,
            () => files,
            SCHEMA,
            (uri) => Uri.parse(uri).fsPath,
        );
        const [scheme, requestSchema, requestContent] = contributor;
        expect(scheme).toBe("dabs");
        expect(requestSchema("file:///w/databricks.yml")).toBe(ROOT_SCHEMA_URI);
        expect(requestSchema("file:///w/resources/job.yml")).toBeUndefined();
        files.push("/w/resources/job.yml");
        expect(requestSchema("file:///w/resources/job.yml")).toBe(ROOT_SCHEMA_URI);
        expect(requestContent(ROOT_SCHEMA_URI)).toBe(SCHEMA);
        expect(requestContent("https://example.com/schema.json")).toBeUndefined();
    });
});

describe("the bundle-yaml feature", () => {
    async function setup(options: { yaml?: boolean; probe?: boolean } = {}) {
        const t = tempDir();
        t.write(
            "project/databricks.yml",
            "bundle: {name: demo}\ninclude: [resources/*.yml]\ntargets:\n  dev: {default: true}\n  prod: {}\n",
        );
        t.write("project/resources/job.yml", "resources: {}\n");
        t.write("project/notes.yml", "a: 1\n");
        vscode.folders = [t.path("project")];
        const registered: Parameters<YamlExtensionApi["registerContributor"]>[] = [];
        const installYaml = () => {
            const api: YamlExtensionApi = {
                registerContributor: (...args) => (registered.push(args), true),
            };
            vscode.extensions.set(YAML.id, {
                isActive: false,
                exports: undefined,
                activate: async () => api,
            });
        };
        if (options.yaml !== false) {
            installYaml();
        }
        const kernel = fakeKernel({
            extension: { ...fakeKernel().extension, globalStoragePath: t.path("storage") },
            folders: new MutableState<readonly string[]>([t.path("project")]),
            files: new FakeFileEvents(),
            ...(options.probe
                ? {
                      env: { ...PROBE_ENV, DATABRICKS_CONFIG_FILE: t.path(".databrickscfg") },
                      settings: fakeSettings({ ...PROBE_SETTINGS }),
                  }
                : {}),
        });
        kernel.runner.on(["version"], {
            stdout: JSON.stringify({
                Version: "1.19.0",
                Tag: "v1.19.0",
                Major: 1,
                Minor: 19,
                Patch: 0,
            }),
        });
        kernel.runner.on(["bundle", "schema"], { stdout: SCHEMA });
        const fake = fakeFeatureHost(kernel);
        startFeatures(registerFeatures([bundleYaml], fake.host));
        kernel.start();
        await when(kernel.project.active, (p) => p !== undefined);
        const open = (relative: string) => {
            const doc = { uri: Uri.file(t.path("project", relative)) };
            vscode.textDocuments.push(doc);
            vscode.documentOpened.fire(doc);
        };
        const schemaRuns = () =>
            kernel.runner.argv.filter((a) => a[0] === "bundle" && a[1] === "schema").length;
        return { t, kernel, fake, registered, open, schemaRuns, installYaml };
    }

    it("does nothing until a bundle file opens, then registers once", async () => {
        const s = await setup();
        s.open("notes.yml");
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(s.kernel.runner.calls).toEqual([]);
        s.open("resources/job.yml");
        await vi.waitFor(() => expect(s.registered).toHaveLength(1));
        s.open("databricks.yml");
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(s.registered).toHaveLength(1);
        expect(s.schemaRuns()).toBe(1);
        expect(
            s.registered[0]![1](Uri.file(s.t.path("project", "resources/job.yml")).toString()),
        ).toBe(ROOT_SCHEMA_URI);
        expect(fs.existsSync(s.t.path("storage", "bundle-schema-1.19.0.json"))).toBe(true);
    });

    it("runs the CLI without the connection", async () => {
        const s = await setup();
        s.open("databricks.yml");
        await vi.waitFor(() => expect(s.registered).toHaveLength(1));
        const call = s.kernel.runner.calls.find((c) => c.args[1] === "schema")!;
        expect(call.options.env!.DATABRICKS_CONFIG_PROFILE).toBeUndefined();
    });

    it("runs bundle schema and the version check for its cache with the host env, without http.proxy (2.22.0)", async () => {
        const s = await setup({ probe: true });
        s.open("databricks.yml");
        await vi.waitFor(() => expect(s.registered).toHaveLength(1));
        const envOf = (match: (args: string[]) => boolean) =>
            environmentOf(s.kernel.runner.calls.find((c) => match(c.args))?.options.env);
        expect({
            version: envOf((a) => a[0] === "version"),
            schema: envOf((a) => a[1] === "schema"),
        }).toEqual({ version: "inherited", schema: "inherited" });
    });

    it("skips the CLI without the YAML extension", async () => {
        const s = await setup({ yaml: false });
        s.open("databricks.yml");
        await vi.waitFor(() =>
            expect(s.fake.log.entries.some((e) => e.message.includes("isn't installed"))).toBe(
                true,
            ),
        );
        expect(s.schemaRuns()).toBe(0);
    });

    it("loads the schema once the YAML extension is installed or enabled, without a reload, and says it was missing once", async () => {
        const s = await setup({ yaml: false });
        s.open("databricks.yml");
        await vi.waitFor(() =>
            expect(s.fake.log.entries.some((e) => e.message.includes("isn't installed"))).toBe(
                true,
            ),
        );
        s.open("resources/job.yml");
        vscode.extensionsChanged.fire();
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(s.registered).toEqual([]);

        s.installYaml();
        vscode.extensionsChanged.fire();
        await vi.waitFor(() => expect(s.registered).toHaveLength(1));
        expect(s.schemaRuns()).toBe(1);
        expect(
            s.fake.log.entries.filter((e) => e.message.includes("isn't installed")),
        ).toHaveLength(1);
    });

    it("loads the schema when the YAML extension is installed after a target switch", async () => {
        const s = await setup({ yaml: false });
        s.open("databricks.yml");
        await vi.waitFor(() =>
            expect(s.fake.log.entries.some((e) => e.message.includes("isn't installed"))).toBe(
                true,
            ),
        );
        await s.kernel.project.selectTarget("prod");
        s.installYaml();
        vscode.extensionsChanged.fire();
        await vi.waitFor(() => expect(s.registered).toHaveLength(1));
    });

    it("logs a failed schema run", async () => {
        const s = await setup();
        s.kernel.runner.on(["bundle", "schema"], { exitCode: 1, stderr: "boom" });
        s.open("databricks.yml");
        await vi.waitFor(() =>
            expect(
                s.fake.log.entries.some((e) => e.message === "Failed to load bundle schema"),
            ).toBe(true),
        );
        expect(s.registered).toEqual([]);
    });
});
