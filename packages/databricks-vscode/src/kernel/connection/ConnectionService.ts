import { isDeepStrictEqual } from "node:util";
import type { HttpClient } from "@databricks/sdk-core/http";
import { isCancellation, UserFacingError } from "../../platform/errors";
import { Emitter, disposeAll, type Disposable, type Event } from "../../platform/event";
import type { Logger } from "../../platform/log";
import { MutableState, when, type State } from "../../platform/reactive";
import { stateKey, type StateStore } from "../../platform/state";
import type { ChildConnection } from "../cli/childEnv";
import type { Host } from "../host/Host";
import type { AccountWorkspace } from "./accountWorkspaces";
import type { ApiClients } from "./ApiClients";
import { credentialsFor, type CredentialSources } from "./credentials";
import { duringSignIn, failedState } from "./fix";
import { workspaceIdFromHost } from "./hostMatching";
import type { HostMetadataCache } from "./hostMetadata";
import type { WorkspaceIdLedger } from "./WorkspaceIds";
import {
    checkWorkspaceAccess,
    connectRemedy,
    listAccountWorkspaces,
    openConnection,
    type ConnectRemedy,
    type WorkspaceAccess,
    profileTarget,
    sessionRemedy,
    type ConnectionTarget,
} from "./openConnection";
import type { WorkspaceRef } from "./hostMatching";
import type { Profiles, ProfilesSnapshot } from "./Profiles";
import {
    resolveConnection,
    type ConnectionSource,
    type ProjectInputs,
    type Resolution,
    type SavedChoice,
    type SessionCredentials,
    type TargetWorkspace,
} from "./resolveConnection";

/** One signed-in workspace. */
export interface Connection {
    readonly host: string;
    readonly workspaceId?: string;
    /** Undefined only for a session window's connection. */
    readonly profile?: string;
    readonly authType: string;
    readonly userName: string;
    readonly source: ConnectionSource;
    readonly api: ApiClients;
    /** The profile's `serverless_compute_id` (`DATABRICKS_SERVERLESS_COMPUTE_ID` in a session); `auto` makes serverless the default compute (COMP-03). */
    readonly serverlessComputeId?: string;
    /** The workspace a bundle target named, for a profile signed in to its account only. */
    readonly targetWorkspace?: TargetWorkspace;
    /** What `childEnv` needs. */
    readonly child: ChildConnection;
}

/** What the sign-in wizard can preselect after a sign-out or a failure. */
export interface SignInHint {
    readonly host?: string;
    readonly profile?: string;
}

export type ConnectionState =
    | {
          readonly status: "signedOut";
          readonly reason: string;
          readonly hint?: SignInHint;
          /** Several profiles match the project target's host; the user picks one. */
          readonly candidates?: readonly string[];
      }
    | {
          readonly status: "connecting";
          readonly profile?: string;
          readonly host?: string;
          /** A browser login is under way for this profile. */
          readonly signingIn?: boolean;
      }
    | { readonly status: "connected"; readonly connection: Connection }
    | {
          readonly status: "error";
          readonly profile?: string;
          readonly host?: string;
          readonly error: Error;
          /**
           * The remedy: an expired OAuth session signs in again, and a profile
           * signed in to the account only selects a workspace; a session's
           * rejected token needs a new session, from a local window.
           */
          readonly remedy?: ConnectRemedy | "restartSession";
      };

/** The saved choice of a window or target: a profile, or an explicit sign-out. */
export interface SavedChoiceState {
    readonly profile?: string;
    readonly signedOut: boolean;
}

/** One connection attempt, for the `autoLogin` and `manualLogin` events. */
export interface ConnectionAttempt {
    readonly manual: boolean;
    readonly success: boolean;
    readonly duration: number;
    /** The workspace came from the bundle target, for a profile signed in to the account only. */
    readonly fromTargetWorkspace: boolean;
}

/**
 * The last choice for windows without a project: a profile, or an explicit
 * sign-out. Global, because an empty window has no stable workspace
 * state. Every window shares it, so a window reads it once and then keeps
 * its own (`ConnectionService.noProjectChoice`).
 */
export const NO_PROJECT_CHOICE = stateKey<SavedChoice | undefined>(
    "databricks.connection.noProjectChoice",
    "global",
    undefined,
);

/** The active bundle project, as the resolver needs it. */
export interface ProjectScope extends ProjectInputs {
    readonly root: string;
}

/** Where the connection learns about the active project (`kernel/project`). */
export interface ProjectConnectionSource {
    /** `initialized` is false until the first detection ends; the resolver waits for it. */
    readonly scope: State<{ readonly initialized: boolean; readonly project?: ProjectScope }>;
    /** Saves the profile for the active target (`authProfile`); undefined removes it. Resolves once `scope` shows it. */
    saveProfile(profile: string | undefined): Promise<void>;
    /** Saves or clears an explicit sign-out of the active target. Resolves once `scope` shows it. */
    saveSignedOut(signedOut: boolean): Promise<void>;
}

/**
 * Where the window's identity comes from (`capabilities.identity`): the
 * profiles the user picks, or the session a session window was opened in,
 * which nothing in the window can change.
 */
export type IdentitySource =
    | { readonly kind: "profiles" }
    | { readonly kind: "session"; readonly credentials: SessionCredentials };

/** The identity of a window on `host`. */
export function identityOf(host: Host): IdentitySource {
    return host.kind === "session"
        ? { kind: "session", credentials: { host: host.host, authType: host.auth } }
        : { kind: "profiles" };
}

export interface ConnectionServiceDeps {
    readonly profiles: Profiles;
    readonly state: StateStore;
    /** The extension host's environment: a session's token is read from it only to connect. */
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly identity: IdentitySource;
    /** Where a local window records which workspace a host served, for session windows' target guard. */
    readonly workspaces?: Pick<WorkspaceIdLedger, "record">;
    readonly sources: CredentialSources;
    /** Without it, every window resolves as one without a project. */
    readonly project?: ProjectConnectionSource;
    readonly log: Logger;
    readonly httpClient?: HttpClient;
    /** Shared with Unity Gateway's connection. */
    readonly hostMetadata: HostMetadataCache;
    readonly now?: () => number;
}

/**
 * Owns the window's connection: resolves it, connects with SCIM `me`,
 * and reconnects when the profiles or the choice change. Resolution is
 * latest-wins, so a change during a slow connect supersedes it.
 */
export class ConnectionService implements Disposable {
    private readonly current = new MutableState<ConnectionState>(
        { status: "connecting" },
        (a, b) => a === b,
    );
    readonly state: State<ConnectionState> = this.current;
    private readonly attempted = new Emitter<ConnectionAttempt>();
    readonly onDidAttempt: Event<ConnectionAttempt> = this.attempted.event;
    private readonly disposables: Disposable[] = [];
    private generation = 0;
    private controller?: AbortController;
    /** What the current connection was built from, to skip reconnecting to the same thing. */
    private connectedFrom?: Resolution;
    private manualPending = false;
    /** While an explicit operation re-reads the profiles, it resolves itself. */
    private explicit = 0;
    /** Browser logins under way. Only the caller that started one resolves the row once it ends. */
    private signIns = 0;
    /** A background resolution was skipped while a login ran: its result is due once the login ends. */
    private resolvedDuringSignIn = false;
    /** This window's no-project choice, once read: another window's choice doesn't move it. */
    private windowChoice?: { readonly value: SavedChoice | undefined };

    constructor(private readonly deps: ConnectionServiceDeps) {}

    get profiles(): Profiles {
        return this.deps.profiles;
    }

    /** What hosts say about themselves, fetched once per host. */
    get hostMetadata(): HostMetadataCache {
        return this.deps.hostMetadata;
    }

    /** The active project's target, if the connection is resolved for one; never a session's. */
    get project(): ProjectScope | undefined {
        return this.deps.identity.kind === "session"
            ? undefined
            : this.deps.project?.scope.value.project;
    }

    /**
     * The workspace the window would use without its project: your sign-in
     * for windows without one, from the profiles as last read. Undefined
     * when there's none, or in a session window.
     */
    noProjectWorkspace(): WorkspaceRef | undefined {
        const snapshot = this.deps.profiles.snapshot.latest;
        if (this.deps.identity.kind === "session" || snapshot === undefined) {
            return undefined;
        }
        const resolution = resolveConnection({
            saved: this.noProjectChoice(),
            envProfile: this.deps.env.DATABRICKS_CONFIG_PROFILE || undefined,
            profiles: snapshot.profiles,
            defaultProfileSetting: snapshot.defaultProfile,
        });
        return resolution.kind === "profile"
            ? { host: resolution.profile.host, workspaceId: resolution.profile.workspaceId }
            : undefined;
    }

    /** The connected connection, or undefined. */
    get connection(): Connection | undefined {
        const s = this.current.value;
        return s.status === "connected" ? s.connection : undefined;
    }

    /**
     * Whether a profile's credentials reach a workspace, before the profile
     * is changed to name it. `unknown` when that can't be checked.
     */
    async checkWorkspace(profile: string, workspaceId: string): Promise<WorkspaceAccess> {
        const info = this.deps.profiles.snapshot.latest?.profiles.find((p) => p.name === profile);
        if (info?.host === undefined) {
            return "unknown";
        }
        let target: ConnectionTarget;
        try {
            target = profileTarget(info, this.deps.sources);
        } catch (error) {
            this.deps.log.warn(
                `Can't check workspace ${workspaceId} with profile ${profile}`,
                error,
            );
            return "unknown";
        }
        return checkWorkspaceAccess(target, workspaceId, this.deps);
    }

    /**
     * The workspaces of a profile's account, for the workspace choice. Empty
     * when the account has no list to give; undefined when the list failed.
     * The list is optional, so a failure is only logged.
     */
    async accountWorkspaces(profile: string): Promise<readonly AccountWorkspace[] | undefined> {
        const info = this.deps.profiles.snapshot.latest?.profiles.find((p) => p.name === profile);
        if (info?.host === undefined || info.accountId === undefined) {
            return [];
        }
        try {
            return await listAccountWorkspaces(
                profileTarget(info, this.deps.sources),
                info.accountId,
                this.deps,
            );
        } catch (error) {
            this.deps.log.warn(`Can't list the workspaces of profile ${profile}'s account`, error);
            return undefined;
        }
    }

    /**
     * Runs a browser login for `profile` (`login`), with the row showing that
     * it's signing in until it ends (see `duringSignIn`). While it runs, a
     * change of the profiles, which the CLI makes as it logs in, doesn't
     * resolve the row: the caller resolves it once the login ends.
     */
    async signingInWith<T>(
        profile: string,
        host: string | undefined,
        login: () => Promise<T>,
    ): Promise<T> {
        const authType = this.deps.profiles.snapshot.latest?.profiles.find(
            (p) => p.name === profile,
        )?.authType;
        this.signIns++;
        // A resolution already under way must not replace the sign-in's row.
        this.generation++;
        let cancelled = false;
        try {
            return await duringSignIn(this.current, { profile, host, authType }, login);
        } catch (error) {
            cancelled = isCancellation(error);
            throw error;
        } finally {
            this.signIns--;
            if (this.signIns === 0 && this.resolvedDuringSignIn) {
                this.resolvedDuringSignIn = false;
                // A cancelled login's row is back as it was: show what the profiles say now.
                if (cancelled) {
                    this.manualPending = true;
                    this.resolve("sign-in cancelled").catch((e: unknown) =>
                        this.deps.log.warn(
                            "Can't resolve the connection after a cancelled sign-in",
                            e,
                        ),
                    );
                }
            }
        }
    }

    /** Starts resolving. Call from `start`, not while registering. */
    start(): void {
        const resolveUnlessExplicit = (reason: string) => {
            if (this.explicit === 0) {
                void this.resolve(reason);
            }
        };
        this.disposables.push(
            this.deps.profiles.snapshot.onDidChange((s) => {
                if (s.status === "ready" || s.status === "error") {
                    resolveUnlessExplicit("profiles changed");
                }
            }),
        );
        if (this.deps.project !== undefined) {
            this.disposables.push(
                this.deps.project.scope.onDidChange(() => resolveUnlessExplicit("project changed")),
            );
        }
        this.deps.profiles.start();
    }

    /**
     * Records an explicit choice for the current scope, then connects to it:
     * for the project's target (`authProfile`), or for windows without a
     * project (global state).
     */
    async useProfile(profile: string): Promise<ConnectionState> {
        this.refuseInSession("use a profile");
        this.manualPending = true;
        return this.explicitly("profile chosen", async () => {
            const project = this.project;
            if (project !== undefined) {
                if (project.signedOut) {
                    await this.deps.project!.saveSignedOut(false);
                }
                await this.deps.project!.saveProfile(profile);
            } else {
                await this.saveNoProjectChoice({ profile });
            }
            // Re-read: the CLI may have just written the profile.
            await this.deps.profiles.refresh("profile chosen").catch(() => {});
        });
    }

    /** The saved choice for this scope, as a sign-in found it: what `restoreChoice` puts back. */
    savedChoice(): SavedChoiceState {
        const project = this.project;
        if (project !== undefined) {
            return { profile: project.savedProfile, signedOut: project.signedOut === true };
        }
        const saved = this.noProjectChoice();
        return {
            profile: saved !== undefined && "profile" in saved ? saved.profile : undefined,
            signedOut: saved !== undefined && "signedOut" in saved,
        };
    }

    /**
     * Puts back a saved choice that a sign-in changed before its browser login
     * was cancelled, and connects with it again, as the window was.
     */
    async restoreChoice(before: SavedChoiceState): Promise<ConnectionState> {
        this.refuseInSession("restore a choice");
        return this.explicitly("sign-in cancelled", async () => {
            const project = this.project;
            if (project !== undefined) {
                if (project.savedProfile !== before.profile) {
                    await this.deps.project!.saveProfile(before.profile);
                }
                if ((project.signedOut === true) !== before.signedOut) {
                    await this.deps.project!.saveSignedOut(before.signedOut);
                }
            } else {
                await this.saveNoProjectChoice(
                    before.signedOut
                        ? { signedOut: true }
                        : before.profile !== undefined
                          ? { profile: before.profile }
                          : undefined,
                );
            }
        });
    }

    /** Forgets the connection for this scope and remembers that, so it stays signed out. */
    async signOut(): Promise<void> {
        this.refuseInSession("sign out");
        const hint = this.hintFromCurrent();
        const project = this.project;
        this.explicit++;
        try {
            if (project !== undefined) {
                await this.deps.project!.saveSignedOut(true);
            } else {
                await this.saveNoProjectChoice({ signedOut: true });
            }
        } finally {
            this.explicit--;
        }
        await this.resolve("signed out", { hint, force: true });
    }

    /** Connects again, for example after `auth login` refreshed an expired session. */
    async reconnect(): Promise<ConnectionState> {
        this.manualPending = true;
        return this.explicitly("reconnect", () =>
            this.deps.profiles.refresh("reconnect").then(
                () => {},
                () => {},
            ),
        );
    }

    /** Read from global state once: the last choice of any window, when this one opened. */
    private noProjectChoice(): SavedChoice | undefined {
        this.windowChoice ??= { value: this.deps.state.get(NO_PROJECT_CHOICE) };
        return this.windowChoice.value;
    }

    /** This window's choice, saved for windows opened later too. */
    private async saveNoProjectChoice(choice: SavedChoice | undefined): Promise<void> {
        await this.deps.state.set(NO_PROJECT_CHOICE, choice);
        this.windowChoice = { value: choice };
    }

    /**
     * A session's identity is the tunnel's, and nothing in its window may
     * change it, nor write the choice that local windows read: Mementos live
     * on the laptop, shared by both.
     */
    private refuseInSession(action: string): void {
        if (this.deps.identity.kind === "session") {
            throw new UserFacingError(
                "FIXED_IDENTITY",
                `A session window can't ${action}: its credentials come from the SSH tunnel.`,
            );
        }
    }

    /**
     * Runs `prepare` while changes it causes don't trigger resolutions of
     * their own, then resolves once, forced.
     */
    private async explicitly(
        reason: string,
        prepare: () => Promise<void>,
    ): Promise<ConnectionState> {
        this.explicit++;
        try {
            await prepare();
        } finally {
            this.explicit--;
        }
        return this.resolve(reason, { force: true });
    }

    private hintFromCurrent(): SignInHint | undefined {
        const s = this.current.value;
        switch (s.status) {
            case "connected":
                return { host: s.connection.host, profile: s.connection.profile };
            case "connecting":
            case "error":
                return { host: s.host, profile: s.profile };
            case "signedOut":
                return s.hint;
        }
    }

    private async resolve(
        reason: string,
        options: { force?: boolean; hint?: SignInHint } = {},
    ): Promise<ConnectionState> {
        if (this.signIns > 0 && !options.force) {
            this.resolvedDuringSignIn = true;
            return this.current.value;
        }
        const generation = ++this.generation;
        const { identity } = this.deps;
        if (this.deps.project !== undefined && identity.kind !== "session") {
            await when(this.deps.project.scope, (s) => s.initialized);
        }
        const snapshotState = await this.deps.profiles.snapshot.settled();
        if (generation !== this.generation) {
            return this.superseded();
        }
        if (snapshotState.status === "error") {
            this.connectedFrom = undefined;
            this.current.set({ status: "error", error: snapshotState.error });
            return this.current.value;
        }
        const snapshot: ProfilesSnapshot =
            snapshotState.status === "ready"
                ? snapshotState.value
                : { configFile: "", exists: false, profiles: [] };
        const project = this.project;
        const resolution = resolveConnection({
            session: identity.kind === "session" ? identity.credentials : undefined,
            project,
            saved: this.noProjectChoice(),
            envProfile: this.deps.env.DATABRICKS_CONFIG_PROFILE || undefined,
            profiles: snapshot.profiles,
            defaultProfileSetting: snapshot.defaultProfile,
        });
        const current = this.current.value;
        if (
            !options.force &&
            current.status === "connected" &&
            sameConnection(resolution, this.connectedFrom)
        ) {
            if (resolution.kind !== "signedOut" && resolution.kind !== "error") {
                // Only the reason changed, for example a project now names the same profile.
                this.connectedFrom = resolution;
                this.current.set({
                    status: "connected",
                    connection: { ...current.connection, source: resolution.source },
                });
            }
            return this.current.value;
        }
        this.deps.log.debug(`Resolving the connection (${reason})`);
        this.controller?.abort();
        const controller = new AbortController();
        this.controller = controller;
        const manual = this.manualPending;
        this.manualPending = false;

        switch (resolution.kind) {
            case "signedOut":
                this.connectedFrom = undefined;
                this.current.set({
                    status: "signedOut",
                    reason: resolution.reason,
                    hint:
                        resolution.host !== undefined
                            ? { host: resolution.host }
                            : (options.hint ?? this.hintFromCurrent()),
                    ...(resolution.candidates ? { candidates: resolution.candidates } : {}),
                });
                return this.current.value;
            case "error":
                this.connectedFrom = undefined;
                this.current.set({ status: "error", error: new Error(resolution.message) });
                return this.current.value;
        }

        const profile = resolution.kind === "profile" ? resolution.profile : undefined;
        const host = resolution.kind === "profile" ? resolution.profile.host! : resolution.host;
        this.current.set({ status: "connecting", profile: profile?.name, host });
        const started = this.deps.now?.() ?? performance.now();
        const finish = (success: boolean) =>
            this.attempted.fire({
                manual,
                success,
                duration: (this.deps.now?.() ?? performance.now()) - started,
                fromTargetWorkspace:
                    profile !== undefined &&
                    resolution.kind === "profile" &&
                    resolution.targetWorkspace !== undefined,
            });
        try {
            const connection = await openConnection(
                this.target(resolution),
                resolution.source,
                this.deps,
                controller.signal,
            );
            if (generation !== this.generation) {
                return this.superseded();
            }
            this.connectedFrom = resolution;
            this.current.set({ status: "connected", connection });
            finish(true);
            if (
                profile !== undefined &&
                profile.workspaceId === undefined &&
                workspaceIdFromHost(host) === undefined &&
                connection.workspaceId !== undefined
            ) {
                // Seen, not configured: what the host serves when nothing names a workspace.
                this.deps.workspaces
                    ?.record(host, connection.workspaceId)
                    .catch((e: unknown) =>
                        this.deps.log.warn(`Can't record ${host}'s workspace`, e),
                    );
            }
            if (
                resolution.source.kind === "onlyProfileForHost" &&
                profile !== undefined &&
                sameTarget(project, this.project)
            ) {
                // Saved, as the old extension did, so that a second profile for
                // the host doesn't make the choice ambiguous later.
                await this.deps.project!.saveProfile(profile.name).catch((e: unknown) => {
                    this.deps.log.warn(`Can't save profile ${profile.name} for the target`, e);
                });
            }
        } catch (error) {
            if (generation !== this.generation) {
                return this.superseded();
            }
            this.connectedFrom = undefined;
            this.deps.log.error(
                `Can't connect with ${profile ? `profile ${profile.name}` : "the session's credentials"}`,
                error,
            );
            const remedy =
                identity.kind === "session"
                    ? sessionRemedy(error)
                    : connectRemedy(profile?.authType, error);
            this.current.set(failedState({ profile: profile?.name, host, error, remedy }));
            finish(false);
        }
        return this.current.value;
    }

    /** A newer resolution took over: wait for its result. */
    private superseded(): Promise<ConnectionState> {
        return when(this.current, (s) => s.status !== "connecting");
    }

    private target(
        resolution: Extract<Resolution, { kind: "profile" | "session" }>,
    ): ConnectionTarget {
        if (resolution.kind === "session") {
            const env = this.deps.env;
            const credentials = credentialsFor(
                {
                    name: "session",
                    host: resolution.host,
                    authType: resolution.authType,
                    token: env.DATABRICKS_TOKEN,
                    clientId: env.DATABRICKS_CLIENT_ID,
                    clientSecret: env.DATABRICKS_CLIENT_SECRET,
                },
                this.deps.sources,
            );
            return {
                credentials,
                host: resolution.host,
                workspaceId: env.DATABRICKS_WORKSPACE_ID || undefined,
                authType: resolution.authType,
                child: {
                    kind: "session",
                    host: resolution.host,
                    authType: resolution.authType,
                },
                serverlessComputeId: env.DATABRICKS_SERVERLESS_COMPUTE_ID || undefined,
            };
        }
        return profileTarget(resolution.profile, this.deps.sources, resolution.targetWorkspace);
    }

    dispose(): void {
        this.controller?.abort();
        disposeAll(this.disposables);
        this.attempted.dispose();
        this.current.dispose();
    }
}

/** Whether the active target is still the one a resolution was for. */
function sameTarget(a: ProjectScope | undefined, b: ProjectScope | undefined): boolean {
    return a !== undefined && b !== undefined && a.root === b.root && a.target === b.target;
}

/** Whether two resolutions connect to the same thing, whatever the reason. */
function sameConnection(a: Resolution, b: Resolution | undefined): boolean {
    const strip = (r: Resolution | undefined) =>
        r !== undefined && "source" in r ? { ...r, source: undefined } : r;
    return isDeepStrictEqual(strip(a), strip(b));
}
