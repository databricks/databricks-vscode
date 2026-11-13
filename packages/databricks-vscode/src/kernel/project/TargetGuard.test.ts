import { describe, expect, it, vi } from "vitest";
import { MutableState, when } from "../../platform/reactive";
import { fakeLog } from "../../test-support/fakes";
import { SESSION_HOST, SESSION_WORKSPACE_ID } from "../../test-support/sessionEnv";
import type { BundleFilesSnapshot } from "../bundle/BundleFiles";
import type { Connection, ConnectionState } from "../connection/ConnectionService";
import type { ProjectSnapshot } from "./ProjectService";
import { TargetGuard, type TargetAccessState } from "./TargetGuard";
import type { ProjectPolicy } from "./targetAccess";

const ROOT = "/Workspace/Users/me/project";

function setup(policy: ProjectPolicy = { kind: "sessionWorkspace", host: SESSION_HOST }) {
    let host: unknown = SESSION_HOST;
    const snapshot = (revision: string): ProjectSnapshot => ({
        root: ROOT,
        project: {
            root: ROOT,
            rootFile: `${ROOT}/databricks.yml`,
            files: [`${ROOT}/databricks.yml`],
            config: { variables: {}, targets: [{ name: "dev", default: true }] },
        },
        target: "dev",
        revision,
        subProjects: [],
    });
    const project = new MutableState<ProjectSnapshot>({ subProjects: [] });
    const connection = new MutableState<ConnectionState>({ status: "connecting" });
    const readFiles = vi.fn(async (root: string): Promise<BundleFilesSnapshot> => ({
        root,
        rootFile: `${root}/databricks.yml`,
        files: [`${root}/databricks.yml`],
        documents: [{ targets: { dev: { workspace: { host } } } }],
        errors: [],
    }));
    const metadata = vi.fn(async () => ({
        hostType: "workspace" as const,
        workspaceId: SESSION_WORKSPACE_ID,
    }));
    const guard = new TargetGuard({
        policy,
        project,
        connection,
        readFiles,
        metadata,
        recorded: () => new Map(),
        log: fakeLog(),
    });
    guard.start();
    const connect = () =>
        connection.set({
            status: "connected",
            connection: { host: SESSION_HOST, workspaceId: SESSION_WORKSPACE_ID } as Connection,
        });
    const decided = async () =>
        (await when(guard.state, (s) => s.status === "decided")) as Extract<
            TargetAccessState,
            { status: "decided" }
        >;
    return {
        guard,
        project,
        connect,
        decided,
        readFiles,
        metadata,
        open: (revision = "r1") => project.set(snapshot(revision)),
        setHost: (h: unknown) => (host = h),
    };
}

describe("TargetGuard", () => {
    it("leaves every target open in a local window", () => {
        const s = setup({ kind: "anyTarget" });
        s.open();
        expect(s.guard.state.value).toEqual({ status: "open" });
        expect(() => s.guard.assertUsable(ROOT, "dev")).not.toThrow();
        expect(s.readFiles).not.toHaveBeenCalled();
    });

    it("checks until the session connects, then decides from the files on disk", async () => {
        const s = setup();
        expect(s.guard.state.value).toEqual({ status: "none" });
        s.open();
        expect(s.guard.state.value).toEqual({ status: "checking", root: ROOT, target: "dev" });
        expect(() => s.guard.assertUsable(ROOT, "dev")).toThrow(
            'Bundle commands for target "dev" wait until this session window has checked',
        );
        s.connect();
        expect((await s.decided()).access).toEqual({ usable: true, via: "sameHost" });
        expect(() => s.guard.assertUsable(ROOT, "dev")).not.toThrow();
        // Asked about another target, it doesn't know it: no.
        expect(() => s.guard.assertUsable(ROOT, "prod")).toThrow();
    });

    it("decides again when a bundle file changes, asking another Databricks host who it is", async () => {
        const s = setup();
        s.open();
        s.connect();
        await s.decided();
        s.setHost("https://other.cloud.databricks.com");
        s.metadata.mockResolvedValueOnce({ hostType: "workspace", workspaceId: "999" });
        s.open("r2");
        const decision = await s.decided();
        expect(decision.access).toMatchObject({ usable: false });
        expect(s.metadata).toHaveBeenCalledWith(
            "https://other.cloud.databricks.com",
            expect.anything(),
        );
        expect(() => s.guard.assertUsable(ROOT, "dev")).toThrow(
            'Bundle commands for target "dev" are paused in this session window: it deploys to https://other.cloud.databricks.com, another workspace than this session\'s.',
        );
    });

    it("has nothing to decide without a project", async () => {
        const s = setup();
        s.connect();
        s.open();
        await s.decided();
        s.project.set({ subProjects: [] });
        expect(s.guard.state.value).toEqual({ status: "none" });
    });

    it("reads the host on disk for each bundle command, without waiting for a file event", async () => {
        const s = setup();
        s.open();
        s.connect();
        await s.decided();
        // Edited just now: no event, no pass, the cached decision is still "usable".
        s.setHost("https://other.cloud.databricks.com");
        s.metadata.mockResolvedValueOnce({ hostType: "workspace", workspaceId: "999" });
        await expect(s.guard.assertUsableNow(ROOT, "dev")).rejects.toThrow(
            'Bundle commands for target "dev" are paused in this session window',
        );
    });

    it("lets a command run while the host on disk is still the session's", async () => {
        const s = setup();
        s.open();
        s.connect();
        await s.decided();
        s.readFiles.mockClear();
        await expect(s.guard.assertUsableNow(ROOT, "dev")).resolves.toBeUndefined();
        expect(s.readFiles).toHaveBeenCalledWith(ROOT);
    });

    it("refuses a command while the session has not connected", async () => {
        const s = setup();
        s.open();
        await expect(s.guard.assertUsableNow(ROOT, "dev")).rejects.toThrow(
            'Bundle commands for target "dev" wait until this session window has checked',
        );
    });

    it("refuses a host the YAML leaves to a variable", async () => {
        const s = setup();
        s.open();
        s.connect();
        await s.decided();
        s.setHost("${var.workspace_host}");
        await expect(s.guard.assertUsableNow(ROOT, "dev")).rejects.toThrow(
            'Bundle commands for target "dev" are paused in this session window',
        );
    });

    it("refuses a command when the bundle can't be read at the moment it starts", async () => {
        const s = setup();
        s.open();
        s.connect();
        await s.decided();
        s.readFiles.mockRejectedValueOnce(new Error("read failed"));
        await expect(s.guard.assertUsableNow(ROOT, "dev")).rejects.toThrow("read failed");
    });

    it("stops waiting for a foreign host's answer when the command is cancelled", async () => {
        const s = setup();
        s.open();
        s.connect();
        await s.decided();
        s.setHost("https://other.cloud.databricks.com");
        s.metadata.mockImplementationOnce(
            ((_host: string, signal: AbortSignal) =>
                new Promise((_resolve, reject) => {
                    signal.addEventListener("abort", () => reject(signal.reason));
                })) as never,
        );
        const controller = new AbortController();
        const pending = s.guard.assertUsableNow(ROOT, "dev", controller.signal);
        controller.abort();
        await expect(pending).rejects.toThrow();
    });

    it("leaves a local window's targets open without reading the files", async () => {
        const s = setup({ kind: "anyTarget" });
        s.open();
        await expect(s.guard.assertUsableNow(ROOT, "dev")).resolves.toBeUndefined();
        expect(s.readFiles).not.toHaveBeenCalled();
    });
});
