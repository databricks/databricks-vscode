import type { Host } from "./Host";

/**
 * What the extension can do where it runs. Features read this
 * (`kernel.capabilities`), never the host's kind: a new kind of host then
 * needs only a new case here, and each feature's behaviour still follows
 * from what it needs.
 */
export interface HostCapabilities {
    /**
     * Where the window's identity comes from: a profile the user picks
     * (sign in, switch, sign out, the config file), or the session the
     * window was opened in, which can't change.
     */
    readonly identity: "profiles" | "session";
    /**
     * Which bundle projects can run their bundle commands: any folder's, or,
     * since the CLI sends the session's token wherever a target points, only
     * targets in the session's workspace (`targetAccess`).
     */
    readonly projects: "anyFolder" | "sessionWorkspace";
    /** The interpreter: set up by the extension, or the session's own. */
    readonly python:
        | { readonly kind: "managed" }
        | { readonly kind: "session"; readonly interpreter?: string };
    /** The workspace's files: reached through its API, or mounted on this machine at `root`. */
    readonly workspaceFiles:
        | { readonly kind: "api" }
        | { readonly kind: "mounted"; readonly root: string };
    /**
     * Which compute the window's projects run on: the target's choice, saved in its overrides, or the
     * session's own compute, which can't change (`session`). Choosing compute, and the run commands
     * that need a choice, are unavailable where it can't change.
     */
    readonly compute: "perTarget" | "session";
    /**
     * The new-project wizard can create a project here. A session window can't open one right away: the
     * CLI writes it through the Workspace Files API, and it shows on the compute's mount only minutes later.
     */
    readonly newProjects: boolean;
    /** "Start SSH tunnel" can open a window from here: it needs this machine's editor command and SSH config. */
    readonly tunnel: boolean;
    /** The AI tools, which install agent skills into this machine's home folder or the project. */
    readonly aiTools: boolean;
    /** The Unity Gateway sign-in and its chat models. */
    readonly unityGateway: boolean;
}

export interface PlatformInfo {
    /** Cursor, which stubs VS Code's Language Model API. */
    readonly isCursor: boolean;
}

export function capabilitiesOf(host: Host, platform: PlatformInfo): HostCapabilities {
    switch (host.kind) {
        case "local":
        case "compute":
            // On compute without a session, local rules apply; the bootstrap warns.
            return {
                identity: "profiles",
                projects: "anyFolder",
                python: { kind: "managed" },
                workspaceFiles: { kind: "api" },
                compute: "perTarget",
                newProjects: true,
                tunnel: true,
                aiTools: true,
                unityGateway: !platform.isCursor,
            };
        case "session":
            return {
                identity: "session",
                // A session's projects run behind the target guard.
                projects: "sessionWorkspace",
                python: {
                    kind: "session",
                    ...(host.interpreter !== undefined ? { interpreter: host.interpreter } : {}),
                },
                // The compute mounts the workspace; the Explorer shows it.
                workspaceFiles: { kind: "mounted", root: "/Workspace" },
                // The session's compute is the window's: no choice of compute for the project.
                compute: "session",
                newProjects: false,
                // The tunnel's window opens through the laptop's editor command and SSH config.
                tunnel: false,
                // They would install into the compute's home, which a serverless session discards.
                aiTools: false,
                // Unity Gateway signs in with a profile.
                unityGateway: false,
            };
    }
}
