/**
 * The manifest contract: `package.json` is hand-written, and these
 * checks keep it in step with the code and with the e2e specs.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { FEATURES } from "../../features";
import { EXTENSION_DEPENDENCIES } from "../../kernel/extensionDependencies";
import { stampCopyKind } from "../../features/configuration-view/copyActions";
import { ClusterSection } from "../../features/compute/ClusterSection";
import { getContextString } from "../../features/bundle-explorer/contextValues";
import { explorerRoots } from "../../features/bundle-explorer/nodes";
import { PipelineDatasetsNode } from "../../features/bundle-explorer/run/runNodes";
import { summaryOutput } from "../../kernel/cli/commands/bundle";
import { NodeGroupSection } from "../../platform/ui/nodeGroup";
import { SECTION_ORDER } from "../../platform/ui/sections";
import { unityGatewayConnectionRows } from "../../features/connection/UnityGatewayConnectionSection";
import {
    workspaceConnectionDetails,
    workspaceConnectionRows,
} from "../../features/connection/WorkspaceConnectionSection";
import { LocalFolderSection } from "../../features/project/LocalFolderSection";
import { TargetSection } from "../../features/project/TargetSection";
import { PythonEnvironmentSection } from "../../features/python/PythonEnvironmentSection";
import type { Readiness } from "../../features/python/setup/readiness";
import { RemoteFolderSection } from "../../features/sync/RemoteFolderSection";
import { AiToolsSection } from "../../features/ai-tools/AiToolsSection";
import { modelsRow } from "../../features/unity-gateway/UnityGatewaySection";
import type { AiToolsState } from "../../features/ai-tools/model";
import type { SyncState } from "../../features/sync/syncState";
import type { ConnectionState } from "../../kernel/connection/ConnectionService";
import type { ConfigurationItem } from "../../platform/ui/sections";
import { SHELL_CONTEXT_KEYS } from "../../kernel/contextKeys";
import { registerFeatures, type RegisteredFeature } from "../../kernel/feature";
import { metadataDefinitions } from "../../kernel/telemetry/definitions";
import { CORE_EVENTS } from "../../kernel/telemetry/events";
import { telemetryModuleFiles, telemetrySchema } from "../../kernel/telemetry/schema";
import { fakeFeatureHost, fakeLog } from "../../test-support/fakes";
import { TreeItemCollapsibleState } from "vscode";
import { host as vscode } from "../../test-support/vscode";
import contract from "./e2eContract.json";
import oldManifest from "./oldManifest.json";

const packageDir = path.resolve(__dirname, "../../..");
const e2eDir = path.resolve(packageDir, "../databricks-vscode-e2e/src");

interface Manifest {
    capabilities?: {
        untrustedWorkspaces?: { supported: boolean | "limited"; description?: string };
    };
    contributes: {
        commands?: { command: string; title: string; category?: string; enablement?: string }[];
        menus?: Record<string, { command?: string; when?: string }[]>;
        viewsContainers?: Record<string, { id: string; title: string }[]>;
        views?: Record<string, { id: string; name: string; when?: string }[]>;
        viewsWelcome?: { view: string; contents: string; when?: string }[];
        submenus?: { id: string; label: string }[];
    };
}

const manifest: Manifest = JSON.parse(
    fs.readFileSync(path.join(packageDir, "package.json"), "utf-8"),
);
const contributes = manifest.contributes;
const contributedCommands = (contributes.commands ?? []).map((c) => c.command);
const views = Object.values(contributes.views ?? {}).flat();

/**
 * One panel shown in two places, with the same title: its two views' `when`s
 * never show both at once, so a helper that matches by title finds one.
 */
const SAME_PANEL_IN_TWO_PLACES: [string, string][] = [["sshTunnelView", "sshTunnelProjectView"]];

function isOnePanelInTwoPlaces(a: string, b: string): boolean {
    return SAME_PANEL_IN_TWO_PLACES.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}
const containers = Object.values(contributes.viewsContainers ?? {}).flat();

/** Commands that are registered but deliberately not contributed. */
const INTERNAL_COMMANDS = [
    "databricks.connection.saveNewProfile",
    "databricks.connection.chooseProfile",
    // The new-project wizard's connected profile, an expired session signed in again first.
    "databricks.connection.connectedProfile",
    // The models' "Sign in again" runs the connection's CLI login, then reconnects the pin.
    "databricks.connection.renewLogin",
    // Unity Gateway's "Select a workspace" runs the connection's workspace choice, which saves it through the CLI.
    "databricks.connection.selectUnityGatewayWorkspace",
    "databricks.sync.showError",
    "databricks.compute.selectServerlessVersion",
    "databricks.aitools.isInstalled",
];

/** Commands of the old extension that are gone, with the reason. */
const REMOVED_COMMANDS: Record<string, string> = {
    "databricks.call": "Ran a closure passed as its argument; rows run their own commands.",
    "databricks.internal.clearOverrides":
        "Cleared the old window-wide overrides of the ConfigModel, which is gone.",
    "databricks.bundle.startManualMigration":
        "Migrated project.json projects to bundles; that migration is dropped.",
    "databricks.internal.showOutput":
        "Showed the Databricks Logs channel for AI tools errors; their Show Logs action reveals it directly.",
    "databricks.configuration.copyAuthType":
        "Copied the profile from the Project view's Auth Type row, which is gone: the Connection view's workspace row names the profile.",
};

/** Views of the old extension that are gone, with the reason. Their rows are sections of the Project view. */
const REMOVED_VIEWS: Record<string, string> = {
    dabsResourceExplorerView: "The bundle resources are the Resources group of the Project view.",
    dabsVariableView: "The bundle variables are the Variables group of the Project view.",
};

/** Settings of the old extension that are gone, with the reason. */
const RETIRED_SETTINGS: Record<string, string> = {
    "databricks.logs.enabled": "VS Code's log levels replace it.",
    "databricks.logs.maxFieldLength": "Formatting of the winston logs, which are gone.",
    "databricks.logs.truncationDepth": "Formatting of the winston logs, which are gone.",
    "databricks.logs.maxArrayLength": "Formatting of the winston logs, which are gone.",
    "databricks.bundle.remoteStateRefreshInterval": "Nothing read it.",
};

/** Views contributed ahead of the feature that will provide their data, with that feature. */
const VIEWS_AWAITING_A_PROVIDER: Record<string, string> = {};

/**
 * The Resources group's rows for a bundle with a job and a pipeline, and for
 * a running job and a pipeline with details, which the explorer's context values name.
 */
async function resourceRows(): Promise<ConfigurationItem[]> {
    const summary = summaryOutput.parse(
        JSON.parse(
            fs.readFileSync(
                path.join(
                    packageDir,
                    "src/kernel/cli/commands/fixtures/bundle/job.dev_test.summary.json",
                ),
                "utf-8",
            ),
        ),
    );
    const section = new NodeGroupSection({
        id: "bundleResources",
        order: SECTION_ORDER.resources,
        label: "Resources",
        groupId: "resources",
        collapsibleState: TreeItemCollapsibleState.Expanded,
        nodes: () =>
            explorerRoots(summary, {
                host: "https://a.cloud.databricks.com",
                root: "/w",
                asAbsolutePath: (p) => p,
            }),
        log: fakeLog(),
    });
    const [group] = await section.getChildren();
    const headers = await section.getChildren(group);
    const items = await Promise.all(headers.map((h) => section.getChildren(h)));
    const running: ConfigurationItem[] = [
        {
            label: "Running job",
            contextValue: getContextString({
                resourceType: "jobs",
                nodeType: "jobs",
                running: true,
                cancellable: true,
            }),
        },
        {
            label: "Pipeline",
            contextValue: getContextString({
                resourceType: "pipelines",
                nodeType: "pipelines",
                hasPipelineDetails: true,
            }),
        },
        { label: "Variables", contextValue: "databricks.configuration.group.variables" },
        // The bare values the run and task rows use; the copy action matches them.
        ...[
            "task_header",
            "catalog",
            "target",
            "state_message",
            "start_time",
            "end_time",
            "dataset_field",
            "datasets_placeholder",
        ].map((contextValue) => ({ label: contextValue, contextValue })),
    ];
    return [group!, ...headers, ...items.flat(), ...running];
}

/** A sample of every row the configuration and Models & AI tools views render so far, in each state, by view. */
async function sidebarRows(): Promise<
    Record<"configurationView" | "modelsAndAiToolsView" | "signInView", ConfigurationItem[]>
> {
    const connection = {
        host: "https://a.cloud.databricks.com",
        profile: "DEFAULT",
        authType: "pat",
        userName: "me",
        source: { kind: "savedForTarget", target: "dev" },
        api: {},
        child: {
            kind: "profile",
            host: "https://a.cloud.databricks.com",
            profile: "DEFAULT",
            authType: "pat",
        },
    } as unknown as Extract<ConnectionState, { status: "connected" }>["connection"];
    const states: ConnectionState[] = [
        { status: "connected", connection },
        { status: "connecting" },
        { status: "signedOut", reason: "You signed out." },
        { status: "signedOut", reason: "Profiles A and B both match.", candidates: ["A", "B"] },
        { status: "error", error: new Error("no") },
    ];
    const project = {
        root: "/w",
        rootFile: "/w/databricks.yml",
        files: ["/w/databricks.yml"],
        config: {
            variables: {},
            targets: [
                {
                    name: "dev",
                    host: "https://a.cloud.databricks.com",
                    mode: "development" as const,
                    default: true,
                },
            ],
        },
    };
    const target = new TargetSection({ project, target: "dev" });
    const targetRows = target.getChildren();
    const syncStates: SyncState[] = [
        "IN_PROGRESS",
        "WATCHING_FOR_CHANGES",
        "STOPPED",
        "ERROR",
        "FILES_IN_WORKSPACE_DISABLED",
    ];
    const remoteFolders = [true, false].flatMap((dev) =>
        [undefined, "https://a.cloud.databricks.com/browse/folders/1"].flatMap((url) =>
            syncStates.map(
                (state) =>
                    new RemoteFolderSection({
                        destination: () => ({
                            localRoot: "/w",
                            remoteRoot: "/Workspace/Users/me/.bundle/demo/dev/files",
                        }),
                        isDevTarget: () => dev,
                        status: () => ({ state, reason: state === "ERROR" ? "boom" : undefined }),
                        url: () => url,
                    }),
            ),
        ),
    );
    const clusterStates = [
        "RUNNING",
        "RESIZING",
        "PENDING",
        "RESTARTING",
        "TERMINATING",
        "TERMINATED",
        "ERROR",
        "UNKNOWN",
    ];
    const computes = [
        undefined,
        { kind: "serverless", source: "profile" } as const,
        ...clusterStates.map((state) => ({
            effective: { kind: "cluster", clusterId: "c-1", source: "override" } as const,
            details: {
                id: "c-1",
                name: "shared",
                state,
                stateMessage: "Inactive",
                creator: "me",
                sparkVersion: "15.4.x-scala2.12",
                accessMode: "SINGLE_USER",
                singleUserName: "me",
            },
        })),
    ];
    const clusters = computes.map((c) => {
        const effective = c === undefined ? undefined : "effective" in c ? c.effective : c;
        const details = c !== undefined && "details" in c ? c.details : undefined;
        return new ClusterSection({
            visible: () => true,
            effective: () => effective,
            attached: () =>
                details === undefined ? undefined : { clusterId: details.id, details },
            useClusterOverride: () => false,
            host: () => "https://a.cloud.databricks.com",
            setUseClusterOverride: () => {},
        });
    });
    const readinesses: Readiness[] = [
        ...(["ready", "notReady", "drifted"] as const).map((status) => ({
            strategy: "uv" as const,
            status,
            checks: [],
        })),
        ...[true, false].map((available) => ({
            strategy: "external" as const,
            status: available ? ("ready" as const) : ("notReady" as const),
            checks: [
                {
                    id: "checkPythonEnvironment",
                    available,
                    title: "Python",
                    warning: "Use python 3.11",
                },
                { id: "checkEnvironmentDependencies", available, title: "Databricks Connect" },
            ],
        })),
    ];
    const agents = [
        {
            displayName: "Claude Code",
            id: "claude-code",
            type: "plugin",
            detected: true,
            supportsProjectScope: true,
            version: "0.2.10",
        },
        {
            displayName: "Goose",
            id: "goose",
            type: "skills-only",
            detected: true,
            supportsProjectScope: true,
        },
        {
            displayName: "Pi",
            id: "pi",
            type: "skills-only",
            detected: false,
            supportsProjectScope: true,
        },
    ] as const;
    const aiToolsStates: AiToolsState[] = [
        { updateStatus: "unknown", detectError: false, agents: [] },
        { updateStatus: "unknown", detectError: true, agents: [] },
        ...(
            ["unknown", "checking", "updating", "upToDate", "updateAvailable", "error"] as const
        ).map((updateStatus) => ({
            installLocation: "project" as const,
            updateStatus,
            version: "0.2.10",
            detectError: false,
            agents,
        })),
    ];
    const aiToolsSections = aiToolsStates.map(
        (state) =>
            new AiToolsSection(
                () => state,
                false,
                () => ({ dispose: () => {} }),
            ),
    );
    const aiToolsRows = aiToolsSections.flatMap((section) =>
        section
            .getChildren()
            .flatMap((root) =>
                section
                    .getChildren(root)
                    .flatMap((row) => [root, row, ...section.getChildren(row)]),
            ),
    );
    const pythonSections = readinesses.map(
        (r) =>
            new PythonEnvironmentSection({ visible: () => true, readiness: () => r, commands: {} }),
    );
    const modelsAndAiToolsView = [
        ...states.map((state) => modelsRow(state, { status: "ready", value: [] })),
        ...aiToolsRows,
        ...aiToolsSections.flatMap((section) => section.getChildren()),
    ];
    const configurationView = [
        ...pythonSections.flatMap((section) =>
            section.getChildren().flatMap((row) => [row, ...section.getChildren(row)]),
        ),
        ...clusters.flatMap((section) =>
            section.getChildren().flatMap((row) => [row, ...section.getChildren(row)]),
        ),
        ...new LocalFolderSection(project).getChildren(),
        ...targetRows,
        ...targetRows.flatMap((row) => target.getChildren(row)),
        ...new TargetSection({ project }).getChildren(),
        ...remoteFolders.flatMap((section) =>
            section.getChildren().flatMap((row) => [row, ...section.getChildren(row)]),
        ),
    ];
    const expired: ConnectionState = {
        status: "error",
        profile: "DEFAULT",
        host: "https://a.cloud.databricks.com",
        error: new Error("expired"),
        remedy: "signInAgain",
    };
    const accountOnly: ConnectionState = {
        status: "error",
        profile: "DEFAULT",
        host: "https://u.databricks.com",
        error: new Error("signed in to the account only"),
        remedy: "selectWorkspace",
    };
    const signInView = [...states, expired, accountOnly].flatMap((state) => [
        ...workspaceConnectionRows(state),
        ...workspaceConnectionRows(state, "dev"),
        // Signed out beside Unity Gateway's row.
        ...workspaceConnectionRows(state, undefined, true),
        ...workspaceConnectionDetails(state),
        ...unityGatewayConnectionRows(state, { status: "connected", connection }),
    ]);
    return {
        configurationView: [...configurationView, ...(await resourceRows())],
        modelsAndAiToolsView,
        signInView,
    };
}

/**
 * The `databricks.*` settings the production code declares with `setting()`
 * (platform/settings.ts), found in the source, with their code defaults.
 */
function declaredSettings(): { id: string; defaultValue: unknown; at: string }[] {
    const src = path.join(packageDir, "src");
    const files = fs
        .readdirSync(src, { recursive: true, encoding: "utf-8" })
        .filter(
            (f) =>
                f.endsWith(".ts") &&
                !f.endsWith(".test.ts") &&
                !/^(test|test-support)[\\/]/.test(f),
        );
    return files.flatMap((f) =>
        [
            ...fs
                .readFileSync(path.join(src, f), "utf-8")
                .matchAll(/\bsetting(?:<.*?>)?\(\s*"databricks",\s*"([\w.]+)",\s*(.*?),?\s*\);/g),
        ].map((m) => ({
            id: `databricks.${m[1]}`,
            // The defaults are literals; one that isn't JSON fails the comparison, visibly.
            defaultValue: m[2] === "undefined" ? undefined : parseLiteral(m[2]!),
            at: f,
        })),
    );
}

function parseLiteral(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return `<not a literal: ${text}>`;
    }
}

/** Every when-clause and enablement in the manifest. */
function whenClauses(): string[] {
    return [
        ...(contributes.commands ?? []).map((c) => c.enablement),
        ...Object.values(contributes.menus ?? {})
            .flat()
            .map((m) => m.when),
        ...views.map((v) => v.when),
        ...(contributes.viewsWelcome ?? []).map((w) => w.when),
    ].filter((w): w is string => w !== undefined);
}

/** Whether the copy action's when-clause matches a row's context value. */
function copyActionMatches(contextValue: string): boolean {
    const when =
        contributes.menus?.["view/item/context"]?.find((e) => e.command === "databricks.utils.copy")
            ?.when ?? "";
    return [...when.matchAll(/viewItem =~ \/((?:[^/\\]|\\.)*)\//g)].some((m) =>
        new RegExp(m[1]!).test(contextValue),
    );
}

describe("manifest contract", () => {
    let registered: RegisteredFeature[];

    beforeAll(() => {
        vscode.reset();
        registered = registerFeatures(FEATURES, fakeFeatureHost().host);
    });

    it("registers every feature without errors", () => {
        expect(registered.filter((r) => r.error !== undefined).map((r) => r.feature.id)).toEqual(
            [],
        );
    });

    it("registers every contributed command, and contributes every registered one", () => {
        const registeredIds = registered.flatMap((r) => r.commandIds);
        expect(contributedCommands.filter((id) => !registeredIds.includes(id))).toEqual([]);
        expect(
            registeredIds.filter(
                (id) => !contributedCommands.includes(id) && !INTERNAL_COMMANDS.includes(id),
            ),
        ).toEqual([]);
    });

    it("lists only contributed commands in menus and welcome links", () => {
        const menuCommands = Object.values(contributes.menus ?? {})
            .flat()
            .map((m) => m.command)
            .filter((c): c is string => c !== undefined);
        const welcomeCommands = (contributes.viewsWelcome ?? []).flatMap((w) =>
            [...w.contents.matchAll(/\(command:([\w.-]+)\)/g)].map((m) => m[1]!),
        );
        const unknown = [...menuCommands, ...welcomeCommands].filter(
            (c) => !c.startsWith("vscode.") && !contributedCommands.includes(c),
        );
        expect(unknown).toEqual([]);
    });

    it("declares every databricks.* context key used in a when-clause", () => {
        const declared = new Set([
            ...SHELL_CONTEXT_KEYS.map((k) => k.name),
            ...FEATURES.flatMap((f) => f.contextKeys ?? []).map((k) => k.name),
        ]);
        // `config.databricks.*` is a setting, not a context key; `/…/` is a regex literal.
        const used = whenClauses()
            .map((w) => w.replace(/=~\s*\/(?:[^/\\]|\\.)*\//g, "=~ //"))
            .flatMap((w) => [...w.matchAll(/(?<![\w.])databricks\.[\w.-]+/g)].map((m) => m[0]));
        expect(used.filter((k) => !declared.has(k))).toEqual([]);
    });

    it.each(["configurationView", "modelsAndAiToolsView", "signInView"] as const)(
        "matches a row %s renders with each of its viewItem clauses",
        async (view) => {
            const rows = (await sidebarRows())[view];
            rows.forEach(stampCopyKind);
            const contextValues = rows
                .map((r) => r.contextValue)
                .filter((c): c is string => c !== undefined);
            const clauses = Object.values(contributes.menus ?? {})
                .flat()
                .map((m) => m.when ?? "")
                .filter((w) => w.includes(`view == ${view} `))
                .flatMap((w) =>
                    [...w.matchAll(/viewItem =~ \/((?:[^/\\]|\\.)*)\//g)].map((m) => m[1]!),
                );
            expect(clauses.length).toBeGreaterThan(0);
            const unmatched = clauses.filter(
                (re) => !contextValues.some((c) => new RegExp(re).test(c)),
            );
            expect(unmatched).toEqual([]);
        },
    );

    it("explains in an untrusted folder why the extension is off, rather than hiding it silently", () => {
        const untrusted = manifest.capabilities?.untrustedWorkspaces;
        expect(untrusted?.supported).toBe(false);
        expect(untrusted?.description?.trim()).toBeTruthy();
    });

    it("starts the less used views collapsed, and VS Code then remembers each person's choice", () => {
        expect(
            views
                .filter((v) => (v as { visibility?: string }).visibility === "collapsed")
                .map((v) => v.id),
        ).toEqual(["sshTunnelView", "sshTunnelProjectView"]);
    });

    it("lists only views that are gone", () => {
        expect(Object.keys(REMOVED_VIEWS).filter((id) => views.some((v) => v.id === id))).toEqual(
            [],
        );
    });

    it("gives the copy action to every row of the Resources group", async () => {
        const rows = (await resourceRows()).filter(
            (r) =>
                r.contextValue !== undefined &&
                !r.contextValue.startsWith("databricks.configuration.group."),
        );
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.filter((r) => !copyActionMatches(r.contextValue!)).map((r) => r.label)).toEqual(
            [],
        );
    });

    it("gives the copy action to the datasets placeholder row of a pipeline", async () => {
        const noDatasets = { fromRuns: () => ({ schemas: new Map(), datasets: new Map() }) };
        const datasets = new PipelineDatasetsNode(
            "pipelines.dlt",
            undefined,
            noDatasets as never,
            undefined,
            {} as never,
        );
        const [placeholder] = await datasets.getChildren();
        const item = placeholder!.getTreeItem() as { label?: string; contextValue?: string };
        expect(item.label).toBe("Run or validate the pipeline to see datasets");
        expect(copyActionMatches(item.contextValue ?? "")).toBe(true);
    });

    it("does not give the copy action to the Target row of the Project view", () => {
        expect(copyActionMatches("databricks.configuration.target")).toBe(false);
    });

    it("registers a tree data provider for every contributed view", () => {
        expect(
            views
                .map((v) => v.id)
                .filter(
                    (id) => !vscode.treeDataProviders.has(id) && !(id in VIEWS_AWAITING_A_PROVIDER),
                ),
        ).toEqual([]);
    });

    it("puts welcome content only on contributed views", () => {
        const ids = views.map((v) => v.id);
        expect(
            (contributes.viewsWelcome ?? []).map((w) => w.view).filter((v) => !ids.includes(v)),
        ).toEqual([]);
    });

    it("has no view name that contains another, since the e2e helpers match by substring", () => {
        const clashes = views.flatMap((a, i) =>
            views
                .filter((b, j) => {
                    const [x, y] = [a.name.toUpperCase(), b.name.toUpperCase()];
                    return i !== j && x.includes(y) && !isOnePanelInTwoPlaces(a.id, b.id);
                })
                .map((b) => `${a.name} ⊇ ${b.name}`),
        );
        expect(clashes).toEqual([]);
    });

    it("shows a panel in two places only with its two views' when-clauses mutually exclusive", () => {
        // The only difference between the two places is the bundle target clause: one negated, one not.
        const TARGET_CLAUSE = /&& (!?)databricks\.context\.bundle\.isTargetSet/;
        for (const [a, b] of SAME_PANEL_IN_TWO_PLACES) {
            const when = (id: string) => views.find((v) => v.id === id)?.when ?? "";
            // Both wait for detection, so neither shows while a target is still being resolved.
            expect(when(a)).toContain("databricks.context.initialized");
            expect(when(b)).toContain("databricks.context.initialized");
            expect(when(a).match(TARGET_CLAUSE)?.[1]).toBe("!");
            expect(when(b).match(TARGET_CLAUSE)?.[1]).toBe("");
            expect(when(a).replace(TARGET_CLAUSE, "")).toBe(when(b).replace(TARGET_CLAUSE, ""));
        }
    });

    it("declares telemetry events with unique names", () => {
        const names = [...CORE_EVENTS, ...FEATURES.flatMap((f) => f.telemetryEvents ?? [])].map(
            (e) => e.name,
        );
        expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
    });

    // scripts/generateTelemetry.mjs writes the VSIX's telemetry.json from the
    // telemetry modules alone, since the features need VS Code: they must
    // hold exactly the events the features declare.
    it("declares every event in the modules telemetry.json is generated from", async () => {
        const events = Object.fromEntries(
            [...CORE_EVENTS, ...FEATURES.flatMap((f) => f.telemetryEvents ?? [])]
                .map((e) => [e.name, { comment: e.comment, ...e.properties }] as const)
                .sort(([a], [b]) => a.localeCompare(b)),
        );
        const modules = await Promise.all(
            telemetryModuleFiles(path.join(packageDir, "src"), ".ts").map(
                (file) => import(file) as Promise<Record<string, unknown>>,
            ),
        );
        expect(telemetrySchema(modules)).toEqual({ events, metadata: metadataDefinitions });
    });

    it("keeps every command of the old extension, or says why it is gone", () => {
        const available = [...contributedCommands, ...INTERNAL_COMMANDS];
        expect(
            oldManifest.commands.filter(
                (id) => !available.includes(id) && !(id in REMOVED_COMMANDS),
            ),
        ).toEqual([]);
        expect(Object.keys(REMOVED_COMMANDS).filter((id) => available.includes(id))).toEqual([]);
    });

    it("keeps every setting of the old extension, or says why it is retired", () => {
        const configuration = (
            manifest as unknown as {
                contributes: { configuration: { properties: Record<string, unknown> }[] };
            }
        ).contributes.configuration;
        const settings = configuration.flatMap((c) => Object.keys(c.properties));
        expect(
            oldManifest.settings.filter(
                (id) => !settings.includes(id) && !(id in RETIRED_SETTINGS),
            ),
        ).toEqual([]);
        expect(Object.keys(RETIRED_SETTINGS).filter((id) => settings.includes(id))).toEqual([]);
    });

    it("contributes every databricks.* setting the code declares, with the same default, and declares every one it contributes", () => {
        const configuration = (
            manifest as unknown as {
                contributes: {
                    configuration: { properties: Record<string, { default?: unknown }> }[];
                };
            }
        ).contributes.configuration;
        const properties: Record<string, { default?: unknown }> = Object.assign(
            {},
            ...configuration.map((c) => c.properties),
        );
        const declared = declaredSettings();
        expect(declared.length).toBeGreaterThan(0);
        expect(
            declared.filter((d) => !(d.id in properties)).map((d) => `${d.id} (${d.at})`),
        ).toEqual([]);
        // VS Code returns the contributed default; `Settings.get` falls back to the code's only on undefined.
        const unset = (v: unknown) => v === undefined || v === null || v === "";
        const differing = declared.filter((d) => {
            const contributed = properties[d.id]?.default;
            return (
                d.id in properties &&
                !(unset(d.defaultValue) && unset(contributed)) &&
                JSON.stringify(d.defaultValue) !== JSON.stringify(contributed)
            );
        });
        expect(
            differing.map(
                (d) =>
                    `${d.id}: code ${JSON.stringify(d.defaultValue)}, package.json ${JSON.stringify(properties[d.id]?.default)}`,
            ),
        ).toEqual([]);
        expect(Object.keys(properties).filter((id) => !declared.some((d) => d.id === id))).toEqual(
            [],
        );
    });

    it("installs the other extensions it relies on as an extension pack, not as dependencies", () => {
        // VS Code starts every extension dependency before this one, at every activation, and
        // doesn't activate this one while one is missing or disabled. A pack only installs them;
        // the features use each through kernel.extensionDependencies, and install the others when they need them.
        // The e2e harness installs the pack.
        const raw = manifest as unknown as {
            extensionDependencies?: string[];
            extensionPack?: string[];
        };
        expect(raw.extensionDependencies).toBeUndefined();
        // In any order: `yarn fmt` sorts package.json.
        expect(raw.extensionPack?.toSorted()).toEqual(
            EXTENSION_DEPENDENCIES.filter((d) => d.inPack)
                .map((d) => d.id)
                .toSorted(),
        );
        expect(new Set(EXTENSION_DEPENDENCIES.map((d) => d.id)).size).toBe(
            EXTENSION_DEPENDENCIES.length,
        );
    });

    it("has unique feature ids", () => {
        const ids = FEATURES.map((f) => f.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe("e2e contract", () => {
    it("has the view containers the specs open", () => {
        const titles = containers.map((c) => c.title);
        expect(contract.viewContainers.filter((c) => !titles.includes(c.title))).toEqual([]);
    });

    it("has the views the specs look for", () => {
        const names = views.map((v) => v.name);
        expect(contract.views.filter((v) => !names.includes(v.name))).toEqual([]);
    });

    it("contributes the commands the specs invoke, or registers them as internal", () => {
        const available = [...contributedCommands, ...INTERNAL_COMMANDS];
        expect(contract.commands.filter((c) => !available.includes(c.id))).toEqual([]);
    });

    it("has the command palette titles the specs type", () => {
        const titles = (contributes.commands ?? []).map((c) =>
            c.category ? `${c.category}: ${c.title}` : c.title,
        );
        expect(contract.paletteTitles.filter((p) => !titles.includes(p.title))).toEqual([]);
    });

    it("has the action titles the specs click: commands' titles, or a submenu's label", () => {
        const titles = [
            ...(contributes.commands ?? []).map((c) => c.title),
            ...(manifest.contributes.submenus ?? []).map((s) => s.label),
        ];
        expect(contract.actionTitles.filter((a) => !titles.includes(a.title))).toEqual([]);
    });

    it("lists every command the e2e specs invoke", () => {
        const specs = fs
            .readdirSync(e2eDir, { recursive: true, encoding: "utf-8" })
            .filter((f) => f.endsWith(".ts"));
        const invoked = specs.flatMap((f) =>
            [
                ...fs
                    .readFileSync(path.join(e2eDir, f), "utf-8")
                    .matchAll(/executeCommand\(\s*["'](databricks\.[\w.-]+)["']/g),
            ].map((m) => m[1]!),
        );
        const listed = contract.commands.map((c) => c.id);
        expect(invoked.filter((id) => !listed.includes(id))).toEqual([]);
    });
});
