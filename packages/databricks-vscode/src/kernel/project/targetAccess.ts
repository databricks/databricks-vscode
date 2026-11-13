/**
 * The target guard: whether a session window may run
 * authenticated bundle commands for a target. In a session the CLI sends the
 * session's token to whatever host the target names, so a bundle command
 * runs only for a target that this decides is in the session's workspace,
 * without sending any credential to find out. Pure: one test per row.
 *
 * It keeps 2.x's rules for what the YAML can't vouch for (#2236,
 * `BundleAuthReason.ts`), and matches the workspace more widely: by the
 * host, by the workspace ID a Databricks host gives without credentials,
 * or by the one a unified host's URL names.
 */
import type { BundleFilesSnapshot } from "../bundle/BundleFiles";
import { includePatterns, mergeBundleDocuments } from "../bundle/LocalBundleConfig";
import {
    hostKey,
    isDatabricksDomain,
    sameWorkspace,
    workspaceIdFromHost,
} from "../connection/hostMatching";

/** Which targets a host may run authenticated bundle commands for. */
export type ProjectPolicy =
    | { readonly kind: "anyTarget" }
    /** Only those in the session's workspace; `host` is the session's, undefined when its environment lacks one. */
    | { readonly kind: "sessionWorkspace"; readonly host?: string };

/** Why the YAML can't vouch for where the CLI would send the token: 2.x's reasons. */
type UnresolvedReason =
    | "profile"
    | "variable"
    | "multi-file"
    | "invalid-host"
    | "absent-target"
    | "glob-class"
    | "unreadable";

/** How the CLI would choose the target's host, read from the bundle's files on disk. */
export type TargetWorkspace =
    | { readonly kind: "noHost" }
    | { readonly kind: "host"; readonly host: string }
    | { readonly kind: "unresolved"; readonly reason: UnresolvedReason };

/** What a Databricks host says about itself at `/.well-known/databricks-config`, asked without credentials. */
export interface HostMetadata {
    readonly hostType: "workspace" | "unified";
    readonly workspaceId?: string;
}

export interface SessionWorkspace {
    readonly host?: string;
    /** From the session's connection (`x-databricks-org-id`); undefined until it connects. */
    readonly workspaceId?: string;
}

export type TargetAccess =
    | {
          readonly usable: true;
          readonly via:
              | "noHost"
              | "sameHost"
              | "workspaceId"
              | "namedWorkspace"
              | "recordedWorkspace";
      }
    | { readonly usable: false; readonly reason: string; readonly remedy: string };

type YamlObject = Record<string, unknown>;

const isObject = (v: unknown): v is YamlObject =>
    typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The target's workspace, as the CLI would resolve it, or why that can't be
 * told. Read from the files themselves, not the project's cached config, so
 * a missed file event can't leave a stale host approved.
 */
export function targetWorkspaceOf(files: BundleFilesSnapshot, target: string): TargetWorkspace {
    const unresolved = (reason: UnresolvedReason): TargetWorkspace => ({
        kind: "unresolved",
        reason,
    });
    if (files.rootFile === undefined || files.errors.length > 0) {
        return unresolved("unreadable");
    }
    // tinyglobby and the CLI's Go globs read `[…]` classes differently: the file sets could differ.
    if (includePatterns(files.documents[0]).some((p) => p.includes("["))) {
        return unresolved("glob-class");
    }
    const merged = mergeBundleDocuments(files.documents);
    const targets = isObject(merged.targets) ? merged.targets : {};
    if (!Object.hasOwn(targets, target)) {
        return unresolved("absent-target");
    }
    const own = isObject(targets[target]) ? targets[target].workspace : undefined;
    if (typeof merged.workspace === "string" || typeof own === "string") {
        return unresolved("variable");
    }
    // The CLI's merge picks one when files disagree; don't bet the token on our order matching it.
    const { hostFiles, profileFiles } = workspaceSources(files.documents, target);
    if (hostFiles > 1 || profileFiles > 1) {
        return unresolved("multi-file");
    }
    const workspace = {
        ...(isObject(merged.workspace) ? merged.workspace : {}),
        ...(isObject(own) ? own : {}),
    };
    // A profile names its own host, over DATABRICKS_HOST; a session has no profiles to compare.
    if (typeof workspace.profile === "string" && workspace.profile.trim() !== "") {
        return unresolved("profile");
    }
    const host: unknown = workspace.host;
    if (host === undefined || host === null || (typeof host === "string" && host.trim() === "")) {
        return { kind: "noHost" };
    }
    if (typeof host !== "string") {
        return unresolved("invalid-host");
    }
    if (host.includes("${")) {
        return unresolved("variable");
    }
    return hostKey(host) === undefined
        ? unresolved("invalid-host")
        : { kind: "host", host: host.trim() };
}

/** How many of the files set the target's host, and its profile, at the top level or in the target. */
function workspaceSources(
    documents: readonly unknown[],
    target: string,
): { hostFiles: number; profileFiles: number } {
    let hostFiles = 0;
    let profileFiles = 0;
    for (const doc of documents) {
        if (!isObject(doc)) {
            continue;
        }
        const top = isObject(doc.workspace) ? doc.workspace : {};
        const targets = isObject(doc.targets) ? doc.targets : {};
        const own = isObject(targets[target]) ? targets[target].workspace : undefined;
        const ownWorkspace = isObject(own) ? own : {};
        if ("host" in top || "host" in ownWorkspace) {
            hostFiles++;
        }
        if ("profile" in top || "profile" in ownWorkspace) {
            profileFiles++;
        }
    }
    return { hostFiles, profileFiles };
}

/**
 * The host whose metadata `targetAccess` needs for this target, if any: a
 * Databricks host other than the session's.
 */
export function metadataHostOf(
    workspace: TargetWorkspace,
    session: SessionWorkspace,
): string | undefined {
    if (workspace.kind !== "host" || sameHost(workspace.host, session)) {
        return undefined;
    }
    return isDatabricksDomain(workspace.host) ? hostKey(workspace.host) : undefined;
}

function sameHost(host: string, session: SessionWorkspace): boolean {
    return (
        session.host !== undefined &&
        sameWorkspace({ host }, { host: session.host, workspaceId: session.workspaceId })
    );
}

/**
 * Whether the session may run authenticated bundle commands for the
 * target, in order:
 * 1. what the YAML can't vouch for: paused, with 2.x's reason;
 * 2. no host: usable, the CLI falls back to the session's `DATABRICKS_HOST`;
 * 3. the session's host (and, on a unified host, its workspace): usable;
 * 4. a workspace host whose workspace ID is the session's: usable;
 * 5. a unified host whose URL names the session's workspace (`?o=`), or that
 *    local windows recorded as serving it, when it names none: usable;
 * 6. anything else: paused, with what would make it usable.
 * Rows 4 and 5 trust only Databricks domains (`isDatabricksDomain`).
 */
export function targetAccess(
    target: string,
    workspace: TargetWorkspace,
    session: SessionWorkspace,
    /** `metadataHostOf`'s host's, fetched without credentials; undefined if not needed, or unknown. */
    metadata: HostMetadata | undefined,
    /** Host → the workspace IDs local windows saw it serve when its URL named none. */
    recorded: ReadonlyMap<string, readonly string[]>,
): TargetAccess {
    const sessionHost = session.host ?? "the session's host";
    const paused = (reason: string, remedy?: string): TargetAccess => ({
        usable: false,
        reason: `Bundle commands for target "${target}" are paused in this session window: ${reason}.`,
        remedy:
            remedy ??
            `Point the target at this session's workspace (${sessionHost}), or work on the project from a local window.`,
    });
    switch (workspace.kind) {
        case "unresolved":
            return paused(UNRESOLVED[workspace.reason], UNRESOLVED_REMEDY[workspace.reason]);
        case "noHost":
            return { usable: true, via: "noHost" };
    }
    const host = workspace.host;
    if (sameHost(host, session)) {
        return { usable: true, via: "sameHost" };
    }
    const elsewhere = `it deploys to ${hostKey(host)}, which may be another workspace than this session's`;
    if (!isDatabricksDomain(host) || session.workspaceId === undefined) {
        return paused(elsewhere);
    }
    const id = session.workspaceId;
    if (metadata?.hostType === "workspace") {
        return metadata.workspaceId === id
            ? { usable: true, via: "workspaceId" }
            : paused(`it deploys to ${hostKey(host)}, another workspace than this session's`);
    }
    if (metadata?.hostType === "unified") {
        const named = workspaceIdFromHost(host);
        if (named !== undefined) {
            return named === id
                ? { usable: true, via: "namedWorkspace" }
                : paused(`it deploys to workspace ${named}, not this session's`);
        }
        const seen = recorded.get(hostKey(host)!) ?? [];
        if (seen.length === 1 && seen[0] === id) {
            return { usable: true, via: "recordedWorkspace" };
        }
        return paused(
            `it deploys to ${hostKey(host)}, which serves several workspaces, and doesn't name one`,
            `Add ?o=${id} to the target's workspace.host, or work on the project from a local window.`,
        );
    }
    return paused(elsewhere);
}

/** 2.x's phrases, completing "Bundle commands … are paused: …". */
/** What to change, where the default ("point the target at the session's workspace") would mislead. */
const UNRESOLVED_REMEDY: Partial<Record<UnresolvedReason, string>> = {
    "unreadable": "Fix the bundle files, or work on the project from a local window.",
    "absent-target":
        "Define the target in the bundle files, or work on the project from a local window.",
    "variable":
        "Set the target's workspace host in the bundle files, or work on the project from a local window.",
};

const UNRESOLVED: Readonly<Record<UnresolvedReason, string>> = {
    "profile": "it selects an authentication profile, which can point at another workspace",
    "variable": "its workspace is set by a ${…} variable this extension can't resolve",
    "multi-file": "its host or profile is set in more than one file",
    "invalid-host": "its workspace host can't be parsed",
    "absent-target": "it isn't defined in the bundle on disk",
    "glob-class": "an include pattern uses a […] class, which the CLI reads differently",
    "unreadable": "its bundle configuration couldn't be read",
};
