import { describe, expect, it } from "vitest";
import type { BundleFilesSnapshot } from "../bundle/BundleFiles";
import { isDatabricksDomain } from "../connection/hostMatching";
import { SESSION_HOST, SESSION_WORKSPACE_ID } from "../../test-support/sessionEnv";
import {
    metadataHostOf,
    targetAccess,
    targetWorkspaceOf,
    type HostMetadata,
    type TargetWorkspace,
} from "./targetAccess";

/**
 * Hosts shaped as a session sees them: the session gets
 * the workspace's canonical host, which answers `host_type: workspace` with
 * its ID; a profile's alias is a unified host that answers with the account
 * only.
 */
const ALIAS = "https://session-alias.databricks.com";
const OTHER = "https://other.cloud.databricks.com";
const SESSION = { host: SESSION_HOST, workspaceId: SESSION_WORKSPACE_ID };
const WORKSPACE: HostMetadata = { hostType: "workspace", workspaceId: SESSION_WORKSPACE_ID };
const UNIFIED: HostMetadata = { hostType: "unified" };

/** The bundle's parsed files, as `readBundleFiles` gives them. */
function files(...documents: unknown[]): BundleFilesSnapshot {
    return {
        root: "/Workspace/Users/me/project",
        rootFile: "/Workspace/Users/me/project/databricks.yml",
        files: documents.map((_, i) => (i === 0 ? "databricks.yml" : `resources/${i}.yml`)),
        documents,
        errors: [],
    };
}

const dev = (workspace?: unknown) => ({
    targets: { dev: workspace === undefined ? {} : { workspace } },
});

describe("targetWorkspaceOf", () => {
    it.each<[string, BundleFilesSnapshot, TargetWorkspace]>([
        ["no host", files(dev()), { kind: "noHost" }],
        ["an empty host", files(dev({ host: " " })), { kind: "noHost" }],
        ["a null host", files(dev({ host: null })), { kind: "noHost" }],
        [
            "the target's host",
            files(dev({ host: `${SESSION_HOST}/` })),
            { kind: "host", host: `${SESSION_HOST}/` },
        ],
        [
            "the top-level host, merged into the target",
            files({ workspace: { host: OTHER }, ...dev() }),
            { kind: "host", host: OTHER },
        ],
        [
            "a profile",
            files(dev({ host: SESSION_HOST, profile: "DEFAULT" })),
            { kind: "unresolved", reason: "profile" },
        ],
        [
            "a ${…} host",
            files(dev({ host: "${var.host}" })),
            { kind: "unresolved", reason: "variable" },
        ],
        [
            "a ${…} workspace",
            files(dev("${var.workspace}")),
            { kind: "unresolved", reason: "variable" },
        ],
        [
            "a host that isn't a string",
            files(dev({ host: 8080 })),
            { kind: "unresolved", reason: "invalid-host" },
        ],
        [
            "an http host",
            files(dev({ host: "http://insecure" })),
            { kind: "unresolved", reason: "invalid-host" },
        ],
        [
            "a host set in two files",
            files(
                { include: ["resources/*.yml"], ...dev({ host: SESSION_HOST }) },
                { workspace: { host: OTHER } },
            ),
            { kind: "unresolved", reason: "multi-file" },
        ],
        [
            "a profile set in two files",
            files(
                { workspace: { profile: "a" }, ...dev() },
                { targets: { dev: { workspace: { profile: "b" } } } },
            ),
            { kind: "unresolved", reason: "multi-file" },
        ],
        [
            "a target the bundle doesn't define",
            files({ targets: { prod: {} } }),
            { kind: "unresolved", reason: "absent-target" },
        ],
        [
            "an include with a […] class",
            files({ include: ["resources/[a-z]*.yml"], ...dev() }),
            { kind: "unresolved", reason: "glob-class" },
        ],
    ])("%s", (_name, snapshot, expected) => {
        expect(targetWorkspaceOf(snapshot, "dev")).toEqual(expected);
    });

    it("can't vouch for a bundle with a file that doesn't parse, or without a root file", () => {
        expect(
            targetWorkspaceOf(
                { ...files(dev()), errors: [{ file: "x.yml", message: "bad" }] },
                "dev",
            ),
        ).toEqual({ kind: "unresolved", reason: "unreadable" });
        expect(
            targetWorkspaceOf({ root: "/p", files: [], documents: [], errors: [] }, "dev"),
        ).toEqual({ kind: "unresolved", reason: "unreadable" });
    });
});

describe("targetAccess, in order", () => {
    const host = (h: string): TargetWorkspace => ({ kind: "host", host: h });
    const none = new Map<string, readonly string[]>();

    it("pauses what the YAML can't vouch for, with 2.x's reason and a remedy", () => {
        expect(
            targetAccess(
                "dev",
                { kind: "unresolved", reason: "profile" },
                SESSION,
                undefined,
                none,
            ),
        ).toEqual({
            usable: false,
            reason: 'Bundle commands for target "dev" are paused in this session window: it selects an authentication profile, which can point at another workspace.',
            remedy: `Point the target at this session's workspace (${SESSION_HOST}), or work on the project from a local window.`,
        });
    });

    it("lets a target without a host run: the CLI falls back to DATABRICKS_HOST, the session's", () => {
        expect(targetAccess("dev", { kind: "noHost" }, SESSION, undefined, none)).toEqual({
            usable: true,
            via: "noHost",
        });
    });

    it("lets the session's own host run, written any way, without asking it", () => {
        for (const written of [SESSION_HOST, `${SESSION_HOST}/`, SESSION_HOST.toUpperCase()]) {
            expect(metadataHostOf(host(written), SESSION)).toBeUndefined();
            expect(targetAccess("dev", host(written), SESSION, undefined, none)).toEqual({
                usable: true,
                via: "sameHost",
            });
        }
    });

    it("lets another name for the session's workspace run, when that host says so without credentials", () => {
        const alias = "https://my-company.cloud.databricks.com";
        expect(metadataHostOf(host(alias), SESSION)).toBe(alias);
        expect(targetAccess("dev", host(alias), SESSION, WORKSPACE, none)).toEqual({
            usable: true,
            via: "workspaceId",
        });
        expect(
            targetAccess(
                "dev",
                host(OTHER),
                SESSION,
                { hostType: "workspace", workspaceId: "999" },
                none,
            ),
        ).toMatchObject({
            usable: false,
            reason: expect.stringContaining(`it deploys to ${OTHER}, another workspace`),
        });
    });

    it("lets a unified host run when its URL names the session's workspace", () => {
        expect(
            targetAccess("dev", host(`${ALIAS}?o=${SESSION_WORKSPACE_ID}`), SESSION, UNIFIED, none),
        ).toEqual({ usable: true, via: "namedWorkspace" });
        expect(targetAccess("dev", host(`${ALIAS}?o=42`), SESSION, UNIFIED, none)).toMatchObject({
            usable: false,
            reason: expect.stringContaining("workspace 42, not this session's"),
        });
    });

    it("lets a unified host that names no workspace run only as local windows recorded it, one workspace", () => {
        expect(targetAccess("dev", host(ALIAS), SESSION, UNIFIED, none)).toEqual({
            usable: false,
            reason: `Bundle commands for target "dev" are paused in this session window: it deploys to ${ALIAS}, which serves several workspaces, and doesn't name one.`,
            remedy: `Add ?o=${SESSION_WORKSPACE_ID} to the target's workspace.host, or work on the project from a local window.`,
        });
        const recorded = (...ids: string[]) => new Map([[ALIAS, ids]]);
        expect(
            targetAccess("dev", host(ALIAS), SESSION, UNIFIED, recorded(SESSION_WORKSPACE_ID)),
        ).toEqual({ usable: true, via: "recordedWorkspace" });
        expect(
            targetAccess(
                "dev",
                host(ALIAS),
                SESSION,
                UNIFIED,
                recorded(SESSION_WORKSPACE_ID, "42"),
            ),
        ).toMatchObject({ usable: false });
    });

    it("never asks or believes a host outside Databricks' domains, whatever it would claim", () => {
        const evil = `https://evil.example.com?o=${SESSION_WORKSPACE_ID}`;
        expect(isDatabricksDomain(evil)).toBe(false);
        expect(metadataHostOf(host(evil), SESSION)).toBeUndefined();
        expect(targetAccess("dev", host(evil), SESSION, WORKSPACE, none)).toMatchObject({
            usable: false,
        });
        expect(
            targetAccess(
                "dev",
                host("https://evil.example.com"),
                SESSION,
                UNIFIED,
                new Map([["https://evil.example.com", [SESSION_WORKSPACE_ID]]]),
            ),
        ).toMatchObject({ usable: false });
    });

    it("pauses a Databricks host it couldn't learn about, or before the session knows its workspace", () => {
        expect(targetAccess("dev", host(OTHER), SESSION, undefined, none)).toMatchObject({
            usable: false,
            reason: expect.stringContaining("may be another workspace"),
        });
        expect(
            targetAccess("dev", host(OTHER), { host: SESSION_HOST }, WORKSPACE, none),
        ).toMatchObject({ usable: false });
    });
});
