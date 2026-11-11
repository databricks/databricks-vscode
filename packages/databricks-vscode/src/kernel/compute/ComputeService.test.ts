import fs from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { MutableState, when } from "../../platform/reactive";
import { apiCluster, FakeClusters, type ApiCluster } from "../../test-support/fakeClusters";
import { fakeKernel, fakeSettings } from "../../test-support/fakes";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode } from "../../test-support/vscode";
import { detectHost } from "../host";
import { SERVERLESS_SESSION_ENV, SESSION_REMOTE_NAME } from "../../test-support/sessionEnv";
import type { ClusterDetails } from "./clusters";

/* eslint-disable @typescript-eslint/naming-convention */

const A = "https://a.cloud.databricks.com";
const tempDir = useTempDirs();

interface Options {
    /** `bundle.cluster_id` in validate's output. */
    bundleClusterId?: string;
    /** Adds `serverless_compute_id = auto` to the profile. */
    serverlessAuto?: boolean;
    overrides?: Record<string, unknown>;
    clusters?: ApiCluster[];
    settings?: Record<string, unknown>;
    groups?: string[];
    /** A session window, as the CLI's SSH tunnel opens one, on serverless compute. */
    session?: boolean;
}

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

/** The real kernel, connected to a one-target project, over an in-memory Clusters API. */
async function setup(options: Options = {}) {
    const t = tempDir();
    const config = t.write(
        ".databrickscfg",
        `[DEFAULT]\nhost = ${A}\ntoken = dapi-default\n${options.serverlessAuto ? "serverless_compute_id = auto\n" : ""}`,
    );
    t.write(
        "project/databricks.yml",
        `bundle: {name: demo}\ntargets:\n  dev: {default: true, mode: development, workspace: {host: ${A}}}\n`,
    );
    if (options.overrides !== undefined) {
        t.write(
            "project/.databricks/bundle/dev/vscode.overrides.json",
            JSON.stringify(options.overrides),
        );
    }
    const root = t.path("project");
    vscode.folders = [root];
    const http = new FakeHttpClient().on("GET", SCIM_ME, () => ({
        body: { userName: "me", groups: (options.groups ?? []).map((display) => ({ display })) },
    }));
    const clusters = new FakeClusters(
        options.clusters ?? [apiCluster("c-1"), apiCluster("c-2", { state: "TERMINATED" })],
    );
    clusters.install(http);
    const env = options.session
        ? {
              // No DATABRICKS_CLUSTER_ID: the session has no compute, which the gate must not read as "a session".
              ...Object.fromEntries(
                  Object.entries(SERVERLESS_SESSION_ENV).filter(
                      ([k]) => k !== "DATABRICKS_CLUSTER_ID",
                  ),
              ),
              DATABRICKS_CONFIG_FILE: t.path("none"),
          }
        : { DATABRICKS_CONFIG_FILE: config };
    const kernel = fakeKernel({
        env,
        ...(options.session ? { host: detectHost(env, { remoteName: SESSION_REMOTE_NAME }) } : {}),
        httpClient: http,
        folders: new MutableState<readonly string[]>([root]),
        files: new FakeFileEvents(),
        settings: fakeSettings(options.settings ?? {}),
    });
    kernel.runner.on(["bundle", "validate"], () => ({
        stdout: JSON.stringify({
            bundle: {
                name: "demo",
                target: "dev",
                mode: "development",
                ...(options.bundleClusterId ? { cluster_id: options.bundleClusterId } : {}),
            },
        }),
    }));
    kernel.runner.on(["bundle", "summary"], () => ({
        stdout: JSON.stringify({ bundle: { name: "demo", target: "dev" } }),
    }));
    kernel.start();
    if (options.session) {
        await tick(300);
    } else {
        await when(kernel.connection.state, (s) => s.status === "connected");
        await when(kernel.bundle.validated, (s) => s.status === "ready");
    }
    const service = kernel.compute;
    const overridesFile = () =>
        JSON.parse(
            fs.readFileSync(
                t.path("project/.databricks/bundle/dev/vscode.overrides.json"),
                "utf-8",
            ),
        ) as Record<string, unknown>;
    const gets = () => http.to("/api/2.1/clusters/get").length;
    return { kernel, service, http, clusters, overridesFile, gets };
}

describe("ComputeService", () => {
    beforeEach(() => vscode.reset());

    it("is the bundle's cluster when nothing is chosen (COMP-03)", async () => {
        const s = await setup({ bundleClusterId: "c-1" });
        expect(s.service.effective.value).toEqual({
            kind: "cluster",
            clusterId: "c-1",
            source: "bundle",
        });
        s.kernel.dispose();
    });

    it("is serverless by default in a connected workspace with nothing chosen, and writes nothing", async () => {
        const s = await setup();
        expect(s.service.effective.value).toEqual({ kind: "serverless", source: "default" });
        expect(s.overridesFile().serverless).toBeUndefined();
        s.kernel.dispose();
    });

    it("isn't serverless by default in a session window, whose compute is the tunnel's", async () => {
        const s = await setup({ session: true });
        expect(s.service.session).toBeUndefined();
        expect(s.service.effective.value).toBeUndefined();
        s.kernel.dispose();
    });

    it("stays detached: a detach is stored, so the default doesn't fill the target again", async () => {
        const s = await setup({ overrides: { clusterId: "c-1" } });
        expect(s.service.effective.value).toEqual({
            kind: "cluster",
            clusterId: "c-1",
            source: "override",
        });
        await s.service.select({ kind: "none" });
        expect(s.service.effective.value).toBeUndefined();
        expect(s.overridesFile()).toMatchObject({ serverless: false });
        expect(s.overridesFile().clusterId).toBeUndefined();
        s.kernel.dispose();
    });

    it("stays detached when the profile says serverless_compute_id = auto too (the profile's default is the same fill)", async () => {
        const s = await setup({ serverlessAuto: true, overrides: { clusterId: "c-1" } });
        await s.service.select({ kind: "none" });
        expect(s.service.effective.value).toBeUndefined();
        expect(s.overridesFile()).toMatchObject({ serverless: false });
        s.kernel.dispose();
    });

    it("a detach with a bundle cluster stores nothing: the bundle's cluster still applies", async () => {
        const s = await setup({ bundleClusterId: "c-2", overrides: { clusterId: "c-1" } });
        await s.service.select({ kind: "none" });
        expect(s.service.effective.value).toEqual({
            kind: "cluster",
            clusterId: "c-2",
            source: "bundle",
        });
        expect(s.overridesFile().serverless).toBeUndefined();
        s.kernel.dispose();
    });

    it("is serverless when the profile says serverless_compute_id = auto", async () => {
        const s = await setup({ serverlessAuto: true });
        expect(s.service.effective.value).toEqual({ kind: "serverless", source: "profile" });
        s.kernel.dispose();
    });

    it("writes a chosen cluster, serverless and a detach to the target's overrides file, keeping other keys (COMP-04)", async () => {
        const s = await setup({ serverlessAuto: true, overrides: { authProfile: "DEFAULT" } });
        await s.service.select({ kind: "cluster", clusterId: "c-2" });
        expect(s.service.effective.value).toEqual({
            kind: "cluster",
            clusterId: "c-2",
            source: "override",
        });
        expect(s.overridesFile()).toEqual({
            authProfile: "DEFAULT",
            clusterId: "c-2",
            serverless: false,
        });

        await s.service.select({ kind: "serverless", version: "4" });
        expect(s.service.effective.value).toEqual({
            kind: "serverless",
            version: "4",
            source: "override",
        });
        expect(s.overridesFile()).toEqual({
            authProfile: "DEFAULT",
            serverless: true,
            serverlessVersion: "4",
            useClusterOverride: false,
        });

        await s.service.select({ kind: "cluster", clusterId: "c-1" });
        expect(s.overridesFile()).toEqual({
            authProfile: "DEFAULT",
            clusterId: "c-1",
            serverless: false,
            useClusterOverride: false,
        });

        await s.service.select({ kind: "none" });
        // Serverless was turned off by the attach, so the profile's default stays off.
        expect(s.service.effective.value).toBeUndefined();
        s.kernel.dispose();
    });

    it("reads the attached cluster only while something observes it, every interval", async () => {
        const s = await setup({ overrides: { clusterId: "c-1" } });
        (s.service as unknown as { deps: { pollIntervalMs: number } }).deps.pollIntervalMs = 30;
        await tick(80);
        expect(s.gets()).toBe(0);
        expect(s.service.attachedCluster.value).toEqual({ clusterId: "c-1" });

        const changes: unknown[] = [];
        const subscription = s.service.attachedCluster.onDidChange((c) => changes.push(c));
        await when(s.service.attachedCluster, (c) => c?.details !== undefined);
        expect(s.service.attachedCluster.value?.details).toMatchObject({
            id: "c-1",
            name: "name-c-1",
            state: "RUNNING",
        });
        await tick(100);
        expect(s.gets()).toBeGreaterThanOrEqual(3);

        subscription.dispose();
        const after = s.gets();
        await tick(100);
        expect(s.gets()).toBe(after);
        expect(changes.length).toBeGreaterThan(0);
        s.kernel.dispose();
    });

    it("keeps the cluster attached, with the error, when it can't be read", async () => {
        const s = await setup({ overrides: { clusterId: "gone" } });
        const subscription = s.service.attachedCluster.onDidChange(() => {});
        await when(s.service.attachedCluster, (c) => c?.error !== undefined);
        expect(s.service.effective.value).toMatchObject({ clusterId: "gone" });
        subscription.dispose();
        s.kernel.dispose();
    });

    it("lists the clusters as they arrive, and replaces the list on a refresh", async () => {
        const s = await setup({ clusters: ["a", "b", "c"].map((id) => apiCluster(id)) });
        s.clusters.pageSize = 1;
        const seen: number[] = [];
        s.service.clusters.onDidChange((l) => seen.push(l.clusters.length));
        await s.service.refreshClusters();
        expect(s.service.clusters.value).toMatchObject({ status: "ready" });
        expect(s.service.clusters.value.clusters.map((c) => c.id)).toEqual(["a", "b", "c"]);
        expect(seen).toEqual([0, 1, 2, 3, 3]);

        s.clusters.clusters.delete("b");
        await s.service.refreshClusters();
        expect(s.service.clusters.value.clusters.map((c) => c.id)).toEqual(["a", "c"]);
        s.kernel.dispose();
    });

    it("lists only accessible clusters with onlyShowAccessibleClusters (port of ClusterLoader.test)", async () => {
        const s = await setup({
            settings: { "databricks.clusters.onlyShowAccessibleClusters": true },
            groups: ["data-team"],
            clusters: [
                apiCluster("mine-single", {
                    data_security_mode: "SINGLE_USER",
                    single_user_name: "me",
                }),
                apiCluster("other-single", {
                    data_security_mode: "SINGLE_USER",
                    single_user_name: "someone",
                }),
                apiCluster("user-acl"),
                apiCluster("group-acl"),
                apiCluster("users-acl"),
                apiCluster("no-acl"),
                apiCluster("job", { cluster_source: "JOB" }),
            ],
        });
        s.clusters.permissions.set("user-acl", [{ user_name: "me" }]);
        s.clusters.permissions.set("group-acl", [{ group_name: "data-team" }]);
        s.clusters.permissions.set("users-acl", [{ group_name: "users" }]);
        s.clusters.permissions.set("no-acl", [{ user_name: "someone" }]);
        await s.service.refreshClusters();
        expect(s.service.clusters.value.clusters.map((c) => c.id).sort()).toEqual([
            "group-acl",
            "mine-single",
            "user-acl",
            "users-acl",
        ]);
        // Single-user clusters are decided without a permissions call.
        expect(s.http.requests.filter((r) => r.url.includes("/permissions/clusters/")).length).toBe(
            4,
        );
        s.kernel.dispose();
    });

    it("starts a terminated cluster and waits until it runs, reporting progress (COMP-05)", async () => {
        const s = await setup();
        (s.service as unknown as { deps: { progressIntervalMs: number } }).deps.progressIntervalMs =
            1;
        s.clusters.startReads = 2;
        const states: string[] = [];
        const cluster = await s.service.startCluster("c-2", {
            onProgress: (c: ClusterDetails) => states.push(c.state),
        });
        expect(cluster.state).toBe("RUNNING");
        expect(s.clusters.starts).toEqual(["c-2"]);
        expect(states[0]).toBe("TERMINATED");
        expect(states).toContain("PENDING");
        expect(states.at(-1)).toBe("RUNNING");
        s.kernel.dispose();
    });

    it("doesn't start a running cluster", async () => {
        const s = await setup();
        expect((await s.service.startCluster("c-1")).state).toBe("RUNNING");
        expect(s.clusters.starts).toEqual([]);
        s.kernel.dispose();
    });

    it("fails a start that ends in ERROR, with the old message", async () => {
        const s = await setup({ clusters: [apiCluster("bad", { state: "TERMINATED" })] });
        (s.service as unknown as { deps: { progressIntervalMs: number } }).deps.progressIntervalMs =
            1;
        s.http.on("POST", "/api/2.1/clusters/start", () => {
            const c = s.clusters.clusters.get("bad")!;
            c.state = "ERROR";
            c.state_message = "No capacity";
            return { body: {} };
        });
        await expect(s.service.startCluster("bad")).rejects.toThrow(
            "Cluster[name-bad]: Error in starting the cluster (No capacity)",
        );
        s.kernel.dispose();
    });

    it("stops a cluster and waits until it has terminated", async () => {
        const s = await setup({ overrides: { clusterId: "c-1" } });
        (s.service as unknown as { deps: { progressIntervalMs: number } }).deps.progressIntervalMs =
            1;
        s.clusters.stopReads = 2;
        const subscription = s.service.attachedCluster.onDidChange(() => {});
        const cluster = await s.service.stopCluster("c-1");
        expect(cluster.state).toBe("TERMINATED");
        expect(s.clusters.stops).toEqual(["c-1"]);
        // The attached cluster shows the new state at once.
        expect(s.service.attachedCluster.value?.details?.state).toBe("TERMINATED");
        subscription.dispose();
        s.kernel.dispose();
    });

    it("forgets the clusters when the connection goes", async () => {
        const s = await setup();
        await s.service.refreshClusters();
        expect(s.service.clusters.value.clusters).toHaveLength(2);
        await s.kernel.connection.signOut();
        expect(s.service.clusters.value).toEqual({ status: "idle", clusters: [] });
        s.kernel.dispose();
    });
});
