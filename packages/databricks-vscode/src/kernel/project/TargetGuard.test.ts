import { describe, expect, it, vi } from "vitest";
import { Emitter } from "../../platform/event";
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
    const bundleFileChanged = new Emitter<void>();
    const detectionEnded = new Emitter<void>();
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
        bundleFileChanged: bundleFileChanged.event,
        detectionEnded: detectionEnded.event,
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
        /** A bundle file changed on disk: the raw event, before the project's debounce. */
        fileChanged: () => bundleFileChanged.fire(),
        /** The project's detection pass ends. `open` publishes a change; this one may not. */
        passEnded: () => detectionEnded.fire(),
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

    it("refuses as soon as a bundle file changes, before the project's debounce", async () => {
        const s = setup();
        s.open();
        s.connect();
        expect((await s.decided()).access).toMatchObject({ usable: true });
        s.fileChanged();
        expect(s.guard.state.value).toEqual({ status: "checking", root: ROOT, target: "dev" });
        expect(() => s.guard.assertUsable(ROOT, "dev")).toThrow(
            'Bundle commands for target "dev" wait until this session window has checked',
        );
    });

    it("decides again after a file change even when the pass finds the same project", async () => {
        const s = setup();
        s.open();
        s.connect();
        await s.decided();
        s.fileChanged();
        // A comment-only edit: the pass publishes no change to the project.
        s.passEnded();
        expect((await s.decided()).access).toMatchObject({ usable: true });
        expect(() => s.guard.assertUsable(ROOT, "dev")).not.toThrow();
    });

    it("drops a decision still in flight when a bundle file changes", async () => {
        const s = setup();
        s.open();
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        // The read started before the edit, so it sees the old host.
        s.readFiles.mockImplementationOnce(async (root: string) => {
            await gate;
            return {
                root,
                rootFile: `${root}/databricks.yml`,
                files: [`${root}/databricks.yml`],
                documents: [{ targets: { dev: { workspace: { host: SESSION_HOST } } } }],
                errors: [],
            };
        });
        s.connect();
        s.fileChanged();
        s.setHost("https://other.cloud.databricks.com");
        s.metadata.mockResolvedValueOnce({ hostType: "workspace", workspaceId: "999" });
        release();
        await new Promise((r) => setTimeout(r, 10));
        expect(s.guard.state.value).toEqual({ status: "checking", root: ROOT, target: "dev" });
        s.passEnded();
        expect((await s.decided()).access).toMatchObject({ usable: false });
    });

    it("leaves a local window's targets open when a bundle file changes", () => {
        const s = setup({ kind: "anyTarget" });
        s.open();
        s.fileChanged();
        expect(s.guard.state.value).toEqual({ status: "open" });
        expect(s.readFiles).not.toHaveBeenCalled();
    });
});
