/**
 * State migrations: with the old extension's
 * state in place, every feature starts on the real kernel, reads what it
 * migrates, and leaves the old keys as they were, so switching back to the
 * old extension loses nothing.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "../../features";
import {
    favoritesKey,
    FAVORITES,
    LEGACY_FAVORITES_COPIED,
} from "../../features/unity-catalog/Favorites";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import { PROJECT_TARGETS } from "../../kernel/project/ProjectService";
import { MutableState, when } from "../../platform/reactive";
import { StateStore } from "../../platform/state";
import { apiCluster, FakeClusters } from "../../test-support/fakeClusters";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { fakeFeatureHost, fakeKernel, fakeMemento } from "../../test-support/fakes";
import { FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode } from "../../test-support/vscode";
import snapshot from "./fixtures/oldState.json";

// It loads `vscode` itself, which exists only in the host.
vi.mock("@vscode/extension-telemetry", () => ({
    TelemetryReporter: class {
        sendTelemetryEvent() {}
        sendTelemetryErrorEvent() {}
        dispose() {
            return Promise.resolve();
        }
    },
}));

/**
 * Keys the old extension wrote that this version doesn't read, with the reason. The fixture still
 * has them, as the old extension left them; the test below checks each is either read or listed here.
 */
const RETIRED_STATE: Record<string, string> = {
    "databricks.quickstart-shown":
        "The Quickstart is a walkthrough that VS Code opens on install, so nothing reads whether the Markdown page was shown.",
};

const HOST = "https://a.cloud.databricks.com";
/** The Unity Gateway sign-in's workspace, in the fixture. */
const UG_HOST = "https://b.cloud.databricks.com";
const tempDir = useTempDirs();

/** Keys the rewrite shares with the old extension and writes at activation, as the old one did. */
const SHARED_WRITTEN_KEYS = [
    "databricks.lastInstalledExtensionVersion",
    // A cache of where the CLI's state file is; both re-derive it from the file.
    "databricks.aitools.installLocation",
];

function fill(value: unknown, root: string): unknown {
    // The root as a JSON string's contents: Windows paths have backslashes to escape.
    const escaped = JSON.stringify(root).slice(1, -1);
    return JSON.parse(JSON.stringify(value).replaceAll("${ROOT}", escaped));
}

async function setup() {
    const t = tempDir();
    const config = t.write(
        ".databrickscfg",
        `[DEFAULT]\nhost = ${HOST}\ntoken = dapi-default\n\n[ug]\nhost = ${UG_HOST}\nworkspace_id = 1234\ntoken = dapi-ug\n`,
    );
    t.write(
        "project/databricks.yml",
        `bundle: {name: demo}\nvariables: {catalog: {default: main}}\ntargets:\n  dev: {default: true, mode: development, workspace: {host: ${HOST}}}\n  prod: {mode: production, workspace: {host: ${HOST}}}\n`,
    );
    const root = t.path("project");
    for (const [file, content] of Object.entries(snapshot.files)) {
        t.write(`project/${file}`, JSON.stringify(content, null, 2));
    }
    const workspace = fakeMemento();
    const global = fakeMemento();
    for (const [key, value] of Object.entries(snapshot.workspace)) {
        workspace.store.set(key, fill(value, root));
    }
    for (const [key, value] of Object.entries(snapshot.global)) {
        global.store.set(key, fill(value, root));
    }
    vscode.folders = [root];
    const http = new FakeHttpClient().on("GET", SCIM_ME, () => ({ body: { userName: "me" } }));
    new FakeClusters([apiCluster("c-1", { cluster_name: "shared" })]).install(http);
    const kernel = fakeKernel({
        env: { DATABRICKS_CONFIG_FILE: config },
        httpClient: http,
        folders: new MutableState<readonly string[]>([root]),
        files: new FakeFileEvents(),
        state: new StateStore({ global, workspace }),
    });
    kernel.runner.on(["bundle", "validate"], (args) => ({
        stdout: JSON.stringify({
            bundle: {
                name: "demo",
                target: args[3],
                mode: args[3] === "dev" ? "development" : "production",
            },
        }),
    }));
    kernel.runner.on(["bundle", "summary"], (args) => ({
        stdout: JSON.stringify({ bundle: { name: "demo", target: args[3] } }),
    }));
    const fake = fakeFeatureHost(kernel);
    const registered = registerFeatures(FEATURES, fake.host);
    kernel.start();
    startFeatures(registered);
    await when(kernel.connection.state, (s) => s.status === "connected");
    await when(kernel.bundle.validated, (s) => s.status === "ready");
    await new Promise((r) => setTimeout(r, 300));
    const dispose = () => {
        for (const { ctx } of registered.toReversed()) {
            ctx.subscriptions.toReversed().forEach((s) => s.dispose());
        }
        kernel.dispose();
    };
    return { t, root, kernel, workspace, global, dispose };
}

describe("state migrations from the old extension", () => {
    beforeEach(() => vscode.reset());

    it("leaves every old key as it was", async () => {
        const s = await setup();
        for (const [location, memento] of [
            ["workspace", s.workspace],
            ["global", s.global],
        ] as const) {
            for (const [key, value] of Object.entries(snapshot[location])) {
                if (!SHARED_WRITTEN_KEYS.includes(key)) {
                    expect(memento.store.get(key), key).toEqual(fill(value, s.root));
                }
            }
        }
        s.dispose();
    });

    it("keeps the project and its target, and copies the target into the per-project key on the next choice", async () => {
        const s = await setup();
        expect(s.kernel.project.active.value?.root).toBe(s.root);
        expect(s.kernel.project.target.value).toBe("prod");
        await s.kernel.project.selectTarget("dev");
        expect(s.workspace.store.get(PROJECT_TARGETS.name)).toEqual({ [s.root]: "dev" });
        expect(s.workspace.store.get("databricks.bundle.target")).toBe("prod");
        s.dispose();
    });

    it("reads the old target files, and keeps keys it doesn't know when it writes them", async () => {
        const s = await setup();
        expect(s.kernel.compute.effective.value).toMatchObject({
            kind: "cluster",
            clusterId: "c-1",
        });
        await vscode.commands.get("databricks.connection.detachCluster")!();
        const file = JSON.parse(
            fs.readFileSync(
                s.t.path("project/.databricks/bundle/prod/vscode.overrides.json"),
                "utf-8",
            ),
        );
        expect(file).toMatchObject({ authProfile: "DEFAULT", somethingNewer: { kept: true } });
        expect(file.clusterId).toBeUndefined();
        s.dispose();
    });

    it("copies the Unity Catalog favorites to the connected host, once", async () => {
        const s = await setup();
        await vi.waitFor(() =>
            expect(s.workspace.store.get(LEGACY_FAVORITES_COPIED.name)).toBe(true),
        );
        const favorites = s.global.store.get(FAVORITES.name) as Record<string, unknown>;
        expect(favorites[favoritesKey({ host: HOST, workspaceId: undefined })]).toEqual(
            snapshot.workspace["databricks.unityCatalog.favorites"],
        );
        s.dispose();
    });

    it("restores the Unity Gateway sign-in that the old extension saved", async () => {
        const s = await setup();
        const state = await when(s.kernel.unityGateway.state, (u) => u.status !== "connecting");
        expect(
            state.status === "connected" && [state.connection.profile, state.connection.host],
        ).toEqual(["ug", UG_HOST]);
        s.dispose();
    });

    it("shows no first-run surface and no AI tools prompt to a user of the old extension", async () => {
        const s = await setup();
        expect(vscode.shownDocuments).toEqual([]);
        expect(vscode.infos.map((i) => i.message)).not.toContainEqual(
            expect.stringContaining("AI tools"),
        );
        s.dispose();
    });

    it("lists each retired key with its reason, and the code doesn't read it again", () => {
        const srcDir = path.resolve(__dirname, "../..");
        const read = (dir: string): string =>
            fs
                .readdirSync(dir, { withFileTypes: true })
                .map((e) => {
                    const p = path.join(dir, e.name);
                    if (e.isDirectory()) return read(p);
                    return e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")
                        ? fs.readFileSync(p, "utf-8")
                        : "";
                })
                .join("\n");
        const code = read(srcDir);
        for (const [k, reason] of Object.entries(RETIRED_STATE)) {
            expect(reason.length, k).toBeGreaterThan(0);
            expect(Object.keys(snapshot.global), k).toContain(k);
            expect(code.includes(`"${k}"`), `${k} is read again`).toBe(false);
        }
    });
});
