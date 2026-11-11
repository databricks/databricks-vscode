import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The extension's oxlint rules for single owners (`oxlint-plugin.mjs`,
 * package root, and `no-restricted-properties` for `showErrorMessage`),
 * through the repo's real `.oxlintrc.json`: fixtures sit at production paths
 * in a copy of the layout, so a rule turned off, a narrowed override or a
 * broken exemption fails here. A fixture breaks each rule at least once.
 */

const packageDir = path.resolve(__dirname, "../../..");
const repoDir = path.resolve(packageDir, "../..");
const pluginFile = path.join(packageDir, "oxlint-plugin.mjs");
// The package's Node script, run with Node: on Windows `node_modules/.bin` has `.cmd` shims, which `execFileSync` can't run.
const oxlint = path.join(repoDir, "node_modules", "oxlint", "bin", "oxlint");

/** The rule codes this test owns; other rules' diagnostics on the fixtures are ignored. */
const SHOW_ERROR = "eslint(no-restricted-properties)";
const owned = (code: string) => code.startsWith("databricks(") || code === SHOW_ERROR;

const SRC = "packages/databricks-vscode/src";
const FEATURE = `${SRC}/features/probe`;
const OPTIONS = `import type {ClientOptions} from "@databricks/sdk-options/client";`;
const SET_CONTEXT = `declare const vscode: any;\nvoid vscode.commands.executeCommand("setContext", "databricks.x", true);\n`;
const NEW_SDK_CLIENT = `import {Tables} from "@databricks/sdk-uc-tables/v1";\nexport const c = new Tables({});\n`;
const SHOW_ERROR_CALL = `declare const window: any;\nvoid window.showErrorMessage("x");\n`;
const GET_EXTENSION = `import * as vscode from "vscode";\nexport const e = vscode.extensions.getExtension("ms-python.python");\n`;
const INSTALL_COMMAND = `declare const vscode: any;\nvoid vscode.commands.executeCommand("workbench.extensions.installExtension", "ms-python.python");\n`;

type Expected = { code: string; severity: "error" | "warning" };
const CONTEXT: Expected = { code: "databricks(context-keys-only)", severity: "error" };
const CLIENT: Expected = { code: "databricks(sdk-clients-through-api)", severity: "error" };
const EXTENSIONS: Expected = { code: "databricks(extensions-through-kernel)", severity: "error" };
const ERROR_POPUP: Expected = { code: SHOW_ERROR, severity: "error" };
const HTTP: Expected = { code: "databricks(http-through-transport)", severity: "error" };

/** Each fixture file, at its production path, and what the real config reports in it. */
const FIXTURES: { file: string; source: string; reports?: Expected[] }[] = [
    // setContext: only ContextKeys, by way of extension.ts, may call it.
    { file: `${FEATURE}/setContext.ts`, source: SET_CONTEXT, reports: [CONTEXT] },
    {
        file: `${FEATURE}/setContextTemplate.ts`,
        source: 'declare const vscode: any;\nvoid vscode.commands.executeCommand(`setContext`, "databricks.x", true);\n',
        reports: [CONTEXT],
    },
    {
        file: `${SRC}/kernel/setContext.ts`,
        source: `declare const run: any;\nvoid run("setContext", "databricks.x", true);\n`,
        reports: [CONTEXT],
    },
    { file: `${SRC}/extension.ts`, source: SET_CONTEXT },
    { file: `${FEATURE}/setContext.test.ts`, source: SET_CONTEXT },

    // Gap clients, and the modules clients are reached through.
    {
        file: `${FEATURE}/gap/odd.ts`,
        source: `${OPTIONS}\nexport class Odd {\n    constructor(private readonly options: ClientOptions) {}\n}\n`,
    },
    {
        file: `${FEATURE}/gap/aliased.ts`,
        source: `import type {ClientOptions as Options} from "@databricks/sdk-options/client";\nexport class Aliased {\n    constructor(readonly options: Options) {}\n}\n`,
    },
    {
        file: `${FEATURE}/gap/typeAlias.ts`,
        source: `${OPTIONS}\ntype Opts = ClientOptions;\nexport class ViaTypeAlias {\n    constructor(readonly options: Opts) {}\n}\n`,
    },
    {
        file: `${FEATURE}/gap/qualified.ts`,
        source: `import type * as opts from "@databricks/sdk-options/client";\nexport class Qualified {\n    constructor(readonly options: opts.ClientOptions) {}\n}\n`,
    },
    {
        file: `${FEATURE}/gap/defaulted.ts`,
        source: `${OPTIONS}\nexport class DefaultedProperty {\n    constructor(readonly options: ClientOptions = {} as ClientOptions) {}\n}\nexport class DefaultedParameter {\n    constructor(options: ClientOptions = {} as ClientOptions) {\n        void options;\n    }\n}\n`,
    },
    {
        file: `${FEATURE}/gap/destructured.ts`,
        source: `${OPTIONS}\nexport class Destructured {\n    constructor({host}: ClientOptions) {\n        void host;\n    }\n}\nexport class DestructuredDefaulted {\n    constructor({host}: ClientOptions = {} as ClientOptions) {\n        void host;\n    }\n}\n`,
    },
    {
        file: `${FEATURE}/gap/anonymousDefault.ts`,
        source: `${OPTIONS}\nexport default class {\n    constructor(readonly options: ClientOptions) {}\n}\n`,
    },
    {
        file: `${FEATURE}/gap/namedDefault.ts`,
        source: `${OPTIONS}\nexport default class NamedDefault {\n    constructor(readonly options: ClientOptions) {}\n}\n`,
    },
    {
        file: `${FEATURE}/gap/localDefault.ts`,
        source: `${OPTIONS}\nclass Local {\n    constructor(readonly options: ClientOptions) {}\n}\nexport default Local;\n`,
    },
    {
        file: `${FEATURE}/gap/importedDefault.ts`,
        source: `import {Odd} from "./odd";\nexport default Odd;\n`,
    },
    {
        file: `${FEATURE}/gap/reExportedDefault.ts`,
        source: `export {Odd as default} from "./odd";\n`,
    },
    {
        file: `${FEATURE}/sdkDefault.ts`,
        source: `import {TablesClient} from "@databricks/sdk-uc-tables/v1";\nexport default TablesClient;\n`,
    },
    {
        file: `${FEATURE}/gap/plain.ts`,
        source: `export class Plain {\n    constructor(readonly n: number) {}\n}\n`,
    },
    {
        file: `${FEATURE}/gap/index.ts`,
        source: `export * from "./odd";\nexport * from "./plain";\n`,
    },
    { file: `${FEATURE}/gap/alias.ts`, source: `export {Odd as Renamed} from "./odd";\n` },
    // Requests go through the transport: not a global fetch, not the SDK's fetch client.
    {
        file: `${FEATURE}/globalFetch.ts`,
        source: `export const r = fetch("https://a.test");\n`,
        reports: [HTTP],
    },
    {
        file: `${FEATURE}/globalThisFetch.ts`,
        source: `export const r = globalThis.fetch("https://a.test");\n`,
        reports: [HTTP],
    },
    {
        file: `${FEATURE}/sdkFetchClient.ts`,
        source: `import {newFetchHttpClient} from "@databricks/sdk-core/http";\nexport const c = newFetchHttpClient();\n`,
        reports: [HTTP, HTTP, HTTP],
    },
    {
        file: `${SRC}/kernel/connection/nodeHttpClient.ts`,
        source: `export const f = fetch;\nexport const c = newFetchHttpClient();\n`,
    },
    { file: `${FEATURE}/fetching.test.ts`, source: `export const r = fetch("https://a.test");\n` },
    {
        file: `${FEATURE}/fetchAsValue.ts`,
        source: `export const f = fetch;\n`,
        reports: [HTTP],
    },
    {
        file: `${FEATURE}/fetchInObject.ts`,
        source: `export const t = {send: fetch};\n`,
        reports: [HTTP],
    },
    {
        file: `${FEATURE}/methodNamedFetch.ts`,
        source: `export class Client {\n    fetch(url: string) {\n        return this.fetch(url);\n    }\n}\n`,
    },
    {
        file: `${FEATURE}/windowFetch.ts`,
        source: `declare const window: any;\nexport const r = window.fetch("https://a.test");\n`,
        reports: [HTTP],
    },
    {
        file: `${FEATURE}/selfFetch.ts`,
        source: `declare const self: any;\nexport const f = self.fetch;\n`,
        reports: [HTTP],
    },
    {
        file: `${FEATURE}/globalComputedFetch.ts`,
        source: `export const r = globalThis["fetch"]("https://a.test");\n`,
        reports: [HTTP],
    },
    {
        file: `${FEATURE}/nodeGlobalFetch.ts`,
        source: `export const r = global.fetch("https://a.test");\n`,
        reports: [HTTP],
    },
    {
        file: `${FEATURE}/renamedGlobalFetch.ts`,
        source: `export const { fetch: send } = globalThis;\n`,
        reports: [HTTP],
    },
    {
        file: `${FEATURE}/computedFetchProperty.ts`,
        source: `declare const cache: Record<string, unknown>;\nexport const f = cache["fetch"];\n`,
    },
    {
        file: `${FEATURE}/undiciRequire.ts`,
        source: `declare const require: (id: string) => unknown;\nexport const u = require("undici");\n`,
        reports: [HTTP],
    },
    {
        file: `${FEATURE}/undiciDynamicImport.ts`,
        source: `export const u = import("undici");\n`,
        reports: [HTTP],
    },
    {
        file: `${FEATURE}/undiciImport.ts`,
        source: `import {fetch} from "undici";\nexport const r = fetch("https://a.test");\n`,
        reports: [HTTP, HTTP],
    },
    {
        file: `${FEATURE}/undiciAlias.ts`,
        source: `import {fetch as send} from "undici";\nexport const r = send("https://a.test");\n`,
        reports: [HTTP],
    },
    {
        file: `${FEATURE}/sdkBarrel.ts`,
        source: `export {TablesClient} from "@databricks/sdk-uc-tables/v1";\n`,
    },
    {
        file: `${FEATURE}/sdkStarBarrel.ts`,
        source: `export * from "@databricks/sdk-uc-grants/v1";\n`,
    },
    {
        file: `${FEATURE}/sdkReExport.ts`,
        source: `import {CatalogsClient} from "@databricks/sdk-uc-catalogs/v1";\nexport {CatalogsClient as Catalogs};\n`,
    },

    // Clients built with `new`, whatever they're called and however they're imported.
    { file: `${FEATURE}/sdkClass.ts`, source: NEW_SDK_CLIENT, reports: [CLIENT] },
    {
        file: `${FEATURE}/sdkNamespace.ts`,
        source: `import * as sdk from "@databricks/sdk-uc-tables/v1";\nexport const c = new sdk.Tables({});\n`,
        reports: [CLIENT],
    },
    {
        file: `${FEATURE}/viaSdkBarrel.ts`,
        source: `import {TablesClient} from "./sdkBarrel";\nexport const c = new TablesClient({});\n`,
        reports: [CLIENT],
    },
    {
        file: `${FEATURE}/viaSdkStarBarrel.ts`,
        source: `import {GrantsClient} from "./sdkStarBarrel";\nexport const c = new GrantsClient({});\n`,
        reports: [CLIENT],
    },
    {
        file: `${FEATURE}/viaSdkReExport.ts`,
        source: `import {Catalogs} from "./sdkReExport";\nexport const c = new Catalogs({});\n`,
        reports: [CLIENT],
    },
    {
        file: `${FEATURE}/viaBarrel.ts`,
        source: `import {Odd} from "./gap";\nexport const c = new Odd({} as never);\n`,
        reports: [CLIENT],
    },
    {
        file: `${FEATURE}/viaAlias.ts`,
        source: `import {Renamed} from "./gap/alias";\nexport const c = new Renamed({} as never);\n`,
        reports: [CLIENT],
    },
    {
        file: `${FEATURE}/viaNamespace.ts`,
        source: `import * as gap from "./gap";\nexport const c = new gap.Odd({} as never);\n`,
        reports: [CLIENT],
    },
    {
        file: `${FEATURE}/viaJsSpecifier.ts`,
        source: `import {Odd} from "./gap/odd.js";\nexport const c = new Odd({} as never);\n`,
        reports: [CLIENT],
    },
    {
        file: `${FEATURE}/defaultedOptions.ts`,
        source: `import {DefaultedProperty, DefaultedParameter} from "./gap/defaulted";\nexport const a = new DefaultedProperty();\nexport const b = new DefaultedParameter();\n`,
        reports: [CLIENT, CLIENT],
    },
    {
        file: `${FEATURE}/destructuredOptions.ts`,
        source: `import {Destructured, DestructuredDefaulted} from "./gap/destructured";\nexport const a = new Destructured({} as never);\nexport const b = new DestructuredDefaulted();\n`,
        reports: [CLIENT, CLIENT],
    },
    {
        file: `${FEATURE}/viaDefaults.ts`,
        source: [
            `import Sdk from "./sdkDefault";`,
            `import Anonymous from "./gap/anonymousDefault";`,
            `import Named from "./gap/namedDefault";`,
            `import Local from "./gap/localDefault";`,
            `import Imported from "./gap/importedDefault";`,
            `import ReExported from "./gap/reExportedDefault";`,
            `export const all = [new Sdk({}), new Anonymous({} as never), new Named({} as never), new Local({} as never), new Imported({} as never), new ReExported({} as never)];`,
        ].join("\n"),
        reports: [CLIENT, CLIENT, CLIENT, CLIENT, CLIENT, CLIENT],
    },
    {
        file: `${FEATURE}/aliasedOptions.ts`,
        source: `import {Aliased} from "./gap/aliased";\nexport const c = new Aliased({} as never);\n`,
        reports: [CLIENT],
    },
    {
        file: `${FEATURE}/typeAliasOptions.ts`,
        source: `import {ViaTypeAlias} from "./gap/typeAlias";\nexport const c = new ViaTypeAlias({} as never);\n`,
        reports: [CLIENT],
    },
    {
        file: `${FEATURE}/qualifiedOptions.ts`,
        source: `import {Qualified} from "./gap/qualified";\nexport const c = new Qualified({} as never);\n`,
        reports: [CLIENT],
    },
    {
        file: `${FEATURE}/localClient.ts`,
        source: `import type {ClientOptions as O} from "@databricks/sdk-options/client";\nclass Mine {\n    constructor(options: O) {\n        void options;\n    }\n}\nexport const c = new Mine({} as never);\n`,
        reports: [CLIENT],
    },
    { file: `${SRC}/kernel/connection/ApiClients.ts`, source: NEW_SDK_CLIENT },
    { file: `${FEATURE}/client.test.ts`, source: NEW_SDK_CLIENT },

    // Other extensions: only the ExtensionHost adapter reads vscode.extensions or runs the Extensions view's commands.
    { file: `${FEATURE}/getExtension.ts`, source: GET_EXTENSION, reports: [EXTENSIONS] },
    {
        file: `${FEATURE}/extensionsNamed.ts`,
        source: `import {extensions} from "vscode";\nexport const e = extensions.getExtension("ms-python.python");\n`,
        reports: [EXTENSIONS],
    },
    {
        file: `${FEATURE}/extensionsAliased.ts`,
        source: `import {extensions as installed} from "vscode";\nexport const all = installed.all;\n`,
        reports: [EXTENSIONS],
    },
    {
        file: `${FEATURE}/extensionsDefault.ts`,
        source: `import code from "vscode";\nexport const changed = code.extensions.onDidChange;\n`,
        reports: [EXTENSIONS],
    },
    { file: `${FEATURE}/installCommand.ts`, source: INSTALL_COMMAND, reports: [EXTENSIONS] },
    {
        file: `${SRC}/kernel/searchCommand.ts`,
        source: 'declare const run: any;\nvoid run(`workbench.extensions.search`, "@id:ms-python.python");\n',
        reports: [EXTENSIONS],
    },
    {
        file: `${SRC}/platform/workspace.ts`,
        source: `${GET_EXTENSION}${INSTALL_COMMAND.replace("declare const vscode: any;\n", "")}`,
    },
    { file: `${FEATURE}/getExtension.test.ts`, source: GET_EXTENSION },
    { file: `${SRC}/test-support/installCommand.ts`, source: INSTALL_COMMAND },

    // showErrorMessage: an error in features/.
    { file: `${FEATURE}/showsError.ts`, source: SHOW_ERROR_CALL, reports: [ERROR_POPUP] },
    { file: `${SRC}/platform/showsError.ts`, source: SHOW_ERROR_CALL },
    { file: `${FEATURE}/showsError.test.ts`, source: SHOW_ERROR_CALL },

    // Allowed.
    {
        file: `${FEATURE}/allowed.ts`,
        source: [
            `import {Tables} from "@databricks/sdk-uc-tables/v1";`,
            `import type {Grants} from "@databricks/sdk-uc-grants/v1";`,
            `import {Plain} from "./gap";`,
            `import type * as types from "vscode";`,
            `import {window, type Extension} from "vscode";`,
            `declare const vscode: any;`,
            `declare const key: string;`,
            `declare const api: {get(c: unknown): unknown};`,
            `void vscode.commands.executeCommand("databricks.x", "setContext");`,
            "void vscode.commands.executeCommand(`${key}`, true);",
            `export const a = api.get(Tables);`,
            `export type G = Grants;`,
            `export const p = new Plain(1);`,
            `export const make = (client: new (o: object) => unknown) => new client({});`,
            `export const m = new Map();`,
            `export type E = Extension<unknown> | types.Extension<unknown>;`,
            `export const w = window.activeTextEditor;`,
            `void vscode.commands.executeCommand("workbench.action.openSettings", "@ext:databricks.databricks");`,
        ].join("\n"),
    },
];

interface Diagnostic {
    code: string;
    severity: string;
    filename: string;
}

/** `.oxlintrc.json`, whose comments are whole `//` lines. */
function repoConfig(): Record<string, unknown> {
    const text = fs.readFileSync(path.join(repoDir, ".oxlintrc.json"), "utf-8");
    return JSON.parse(text.replace(/^\s*\/\/.*$/gm, "")) as Record<string, unknown>;
}

/**
 * Writes the fixtures and a copy of the real config into `dir`, and lints
 * them with it. The copy differs only in what a temporary directory needs:
 * the plugin's absolute path, and no type-aware rules, which need a
 * tsconfig and decide none of these rules.
 */
function lintWithRepoConfig(dir: string): Diagnostic[] {
    for (const { file, source } of FIXTURES) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), source);
    }
    const config = repoConfig();
    config.jsPlugins = [pluginFile];
    config.options = { ...(config.options as object), typeAware: false };
    fs.writeFileSync(path.join(dir, ".oxlintrc.json"), JSON.stringify(config));
    let output: string;
    try {
        output = execFileSync(
            process.execPath,
            [oxlint, "-c", ".oxlintrc.json", "--format", "json", "packages"],
            { cwd: dir, encoding: "utf-8" },
        );
    } catch (e) {
        // oxlint exits non-zero when it reports errors.
        output = (e as { stdout: string }).stdout;
    }
    // oxlint prints paths relative to `dir`, except in a JetBrains terminal (TERMINAL_EMULATOR), where it prints file:// URLs.
    const absolute = (filename: string) =>
        filename.startsWith("file://") ? fileURLToPath(filename) : path.resolve(dir, filename);
    // With `/`, as the fixtures name them, on Windows too.
    return (JSON.parse(output) as { diagnostics: Diagnostic[] }).diagnostics.map((d) => ({
        ...d,
        filename: path.relative(dir, absolute(d.filename)).split(path.sep).join("/"),
    }));
}

describe("the extension's oxlint rules, through the repo's config", () => {
    let rules: string[];
    let dir: string;
    let diagnostics: Diagnostic[];

    beforeAll(async () => {
        const plugin = (await import(pathToFileURL(pluginFile).href)) as {
            default: { rules: Record<string, unknown> };
        };
        rules = Object.keys(plugin.default.rules);
        dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "databricks-vscode-lint-")));
        diagnostics = lintWithRepoConfig(dir);
    });

    afterAll(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it("reports each fixture's violations with the configured severity, and nothing in owners, tests or allowed code", () => {
        for (const { file, reports = [] } of FIXTURES) {
            const found = diagnostics
                .filter((d) => d.filename === file && owned(d.code))
                .map(({ code, severity }) => ({ code, severity }));
            expect(found, file).toEqual(reports);
        }
    });

    it("reads oxlint's filenames as the fixtures' paths", () => {
        const fixtures = new Set(FIXTURES.map((f) => f.file));
        expect(diagnostics.map((d) => d.filename).filter((f) => !fixtures.has(f))).toEqual([]);
    });

    it("has a fixture that breaks every plugin rule, and the showErrorMessage restriction", () => {
        const broken = new Set(FIXTURES.flatMap((f) => (f.reports ?? []).map((r) => r.code)));
        expect(broken).toEqual(new Set([...rules.map((r) => `databricks(${r})`), SHOW_ERROR]));
    });
});
