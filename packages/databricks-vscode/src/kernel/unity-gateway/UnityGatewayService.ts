import type { HttpClient } from "@databricks/sdk-core/http";
import { CancelledError } from "../../platform/errors";
import { disposeAll, type Disposable } from "../../platform/event";
import type { Logger } from "../../platform/log";
import { MutableState, type State } from "../../platform/reactive";
import { stateKey, type StateStore } from "../../platform/state";
import type { Connection, ConnectionState } from "../connection/ConnectionService";
import type { CredentialSources } from "../connection/credentials";
import { hostKey, normalizeHost } from "../connection/hostMatching";
import type { HostMetadataCache } from "../connection/hostMetadata";
import { duringSignIn, failedState, type FailedState } from "../connection/fix";
import { connectRemedy, openConnection, profileTarget } from "../connection/openConnection";
import type { Profiles, ProfilesSnapshot } from "../connection/Profiles";
import { UnityGatewayModels } from "./UnityGatewayModels";

/** The Unity Gateway sign-in, in the old extension's shape. No secrets: the profile holds them. */
export interface SavedUnityGatewayProfile {
    readonly profile: string;
    /** As the old extension wrote it: `https://<hostname>/`. */
    readonly host: string;
    /** Missing when the workspace didn't send one. */
    readonly workspaceId?: string;
}

/** Per user, not per window, as in the old extension. Signing out deletes it. */
export const UNITY_GATEWAY_SAVED_PROFILE = stateKey<SavedUnityGatewayProfile | undefined>(
    "databricks.unityGateway.savedProfile",
    "global",
    undefined,
);

/**
 * Unity Gateway has had a profile of its own: a sign-in saved one, or a
 * sign-out removed one. From then on `copy()` does nothing. Per user.
 */
export const UNITY_GATEWAY_SIGNED_IN_BEFORE = stateKey<boolean>(
    "databricks.unityGateway.signedInBefore",
    "global",
    false,
);

export interface UnityGatewayServiceDeps {
    readonly profiles: Profiles;
    readonly state: StateStore;
    readonly sources: CredentialSources;
    /** False in a session window and in Cursor: nothing is restored or signed in. */
    readonly available: boolean;
    readonly log: Logger;
    readonly httpClient?: HttpClient;
    readonly hostMetadata: HostMetadataCache;
}

const SIGNED_OUT: ConnectionState = {
    status: "signedOut",
    reason: "Not signed in to Unity Gateway.",
};

/**
 * The Unity Gateway sign-in: a connection of its own, separate from the
 * window's (`ConnectionService`). A bundle target or a workspace switch never
 * moves it, and signing out of either leaves the other. It starts as a copy
 * of the first workspace connection (`copy()`), once per user, and signs in
 * again with a workspace sign-in by hand made while both are signed out (the
 * connection feature). Otherwise it only ever connects to the profile saved
 * for it, never to a default one.
 * Outside an attempt its state describes the saved profile: signed out when
 * none is saved, an error when it didn't connect. Latest wins: a newer
 * attempt or a sign-out aborts the one in flight.
 */
export class UnityGatewayService implements Disposable {
    private readonly current = new MutableState<ConnectionState>(SIGNED_OUT, (a, b) => a === b);
    readonly state: State<ConnectionState> = this.current;
    /** The models of the signed-in workspace. */
    readonly models: UnityGatewayModels;
    private generation = 0;
    private controller?: AbortController;
    /** The restore in flight, shared by `reconnect()` calls while it's the latest attempt. */
    private restoring?: { readonly generation: number; readonly promise: Promise<ConnectionState> };
    /** The attempt in flight is `copy()`'s, not one the user started. */
    private copying = false;
    private startup?: Promise<ConnectionState | undefined>;
    private readonly disposables: Disposable[] = [];

    constructor(private readonly deps: UnityGatewayServiceDeps) {
        this.models = new UnityGatewayModels(this.current, deps.log);
    }

    get available(): boolean {
        return this.deps.available;
    }

    /** The connected connection, or undefined. */
    get connection(): Connection | undefined {
        const s = this.current.value;
        return s.status === "connected" ? s.connection : undefined;
    }

    /** The profile saved for Unity Gateway, which its restore at start connects with. */
    get savedProfile(): SavedUnityGatewayProfile | undefined {
        return this.deps.state.get(UNITY_GATEWAY_SAVED_PROFILE);
    }

    /**
     * The restore `start()` began, for the one notice a failed one gets: it
     * has no UI of its own. Undefined when the user signed in or out while it
     * ran: that replaced it, and says how it went.
     */
    get started(): Promise<ConnectionState | undefined> | undefined {
        return this.startup;
    }

    /** Restores the saved sign-in without UI. Call once the profiles have started loading. */
    start(): void {
        this.disposables.push(
            this.deps.profiles.snapshot.onDidChange((s) => {
                // Connected, and the saved profile was deleted: sign out, with the reason.
                const saved = this.deps.state.get(UNITY_GATEWAY_SAVED_PROFILE);
                if (
                    s.status === "ready" &&
                    this.current.value.status === "connected" &&
                    saved !== undefined &&
                    !s.value.profiles.some((p) => p.name === saved.profile)
                ) {
                    this.begin();
                    this.current.set({
                        status: "signedOut",
                        reason: `Profile '${saved.profile}' no longer exists.`,
                    });
                }
            }),
        );
        const restore = this.reconnect();
        // `restore` starts its attempt (`begin()`) before its first await.
        const generation = this.generation;
        this.startup = restore.then((s) => (generation === this.generation ? s : undefined));
    }

    /**
     * Connects with the saved profile again, as at start. Does nothing when
     * connected or nothing is saved. Concurrent calls share one attempt.
     */
    reconnect(): Promise<ConnectionState> {
        if (!this.deps.available || this.current.value.status === "connected") {
            return Promise.resolve(this.current.value);
        }
        if (this.restoring?.generation !== this.generation) {
            // `restore` starts its attempt (`begin()`) before its first await.
            const promise = this.restore();
            const restoring = { generation: this.generation, promise };
            this.restoring = restoring;
            void restoring.promise.finally(() => {
                if (this.restoring === restoring) {
                    this.restoring = undefined;
                }
            });
        }
        return this.restoring.promise;
    }

    /**
     * Runs a browser login for `profile` (`login`), with Unity Gateway's row
     * showing that it's signing in. See `duringSignIn`.
     */
    signingInWith<T>(
        profile: string,
        host: string | undefined,
        login: () => Promise<T>,
    ): Promise<T> {
        const authType = this.deps.profiles.snapshot.latest?.profiles.find(
            (p) => p.name === profile,
        )?.authType;
        return duringSignIn(this.current, { profile, host, authType }, login);
    }

    /**
     * Signs in with a profile, or switches to it. The profile is saved only
     * once it has connected. A failure leaves the row as a failed workspace
     * sign-in does, showing the profile it tried, and rethrows. The previous
     * connection is not kept.
     */
    async signIn(profile: string): Promise<Connection> {
        if (!this.deps.available) {
            throw new Error("Unity Gateway isn't available here.");
        }
        const { generation, signal } = this.begin();
        this.current.set({ status: "connecting", profile });
        try {
            // The CLI may have just written the profile.
            const snapshot = await this.deps.profiles.refresh("Unity Gateway sign-in");
            const connection = await this.connect(snapshot, profile, signal);
            this.ensureLatest(generation);
            await this.deps.state.set(UNITY_GATEWAY_SAVED_PROFILE, {
                profile,
                host: normalizeHost(connection.host).toString(),
                ...(connection.workspaceId !== undefined
                    ? { workspaceId: connection.workspaceId }
                    : {}),
            });
            await this.deps.state.set(UNITY_GATEWAY_SIGNED_IN_BEFORE, true);
            this.ensureLatest(generation);
            this.current.set({ status: "connected", connection });
            return connection;
        } catch (error) {
            if (generation !== this.generation) {
                throw new CancelledError();
            }
            this.current.set(this.failed(profile, this.profileHost(profile), error));
            throw error;
        }
    }

    /**
     * Signs in with a workspace connection's profile, the first time only:
     * Unity Gateway has never had a profile of its own, and no sign-in of the
     * user's or restore is in flight. It supersedes an earlier copy still in
     * flight, so the latest workspace wins; a failed one saves nothing, so the
     * next connection tries again. Undefined when it doesn't copy.
     */
    copy(profile: string): Promise<Connection> | undefined {
        const { status } = this.current.value;
        // An error with nothing saved is a copy or a first sign-in that failed: a later copy tries again.
        const idle =
            status === "signedOut" ||
            status === "error" ||
            (status === "connecting" && this.copying);
        if (
            !this.deps.available ||
            !idle ||
            this.deps.state.get(UNITY_GATEWAY_SAVED_PROFILE) !== undefined ||
            this.deps.state.get(UNITY_GATEWAY_SIGNED_IN_BEFORE)
        ) {
            return undefined;
        }
        // `signIn` starts its attempt (`begin()`) before its first await.
        const attempt = this.signIn(profile);
        this.copying = true;
        return attempt;
    }

    /**
     * Forgets the saved profile and disconnects, also while an attempt is in
     * flight. Unity Gateway then stays signed out until the user signs in to it.
     */
    async signOut(): Promise<void> {
        this.begin();
        await this.deps.state.set(UNITY_GATEWAY_SAVED_PROFILE, undefined);
        await this.deps.state.set(UNITY_GATEWAY_SIGNED_IN_BEFORE, true);
        this.current.set(SIGNED_OUT);
    }

    private async restore(): Promise<ConnectionState> {
        const saved = this.deps.state.get(UNITY_GATEWAY_SAVED_PROFILE);
        if (saved === undefined) {
            return this.current.value;
        }
        const { generation, signal } = this.begin();
        this.current.set({
            status: "connecting",
            profile: saved.profile,
            host: hostKey(saved.host),
        });
        try {
            const connection = await this.connect(
                await this.loadedProfiles(),
                saved.profile,
                signal,
                saved,
            );
            if (generation === this.generation) {
                this.current.set({ status: "connected", connection });
            }
        } catch (error) {
            if (generation === this.generation) {
                this.deps.log.error(
                    `Can't restore the Unity Gateway sign-in with profile ${saved.profile}`,
                    error,
                );
                this.current.set(this.failed(saved.profile, hostKey(saved.host), error));
            }
        }
        return this.current.value;
    }

    /**
     * Connects with a profile. With `saved`, the profile must still point at
     * the saved workspace: the config file can differ between windows, and a
     * unified host serves several workspaces.
     */
    private async connect(
        snapshot: ProfilesSnapshot,
        name: string,
        signal: AbortSignal,
        saved?: SavedUnityGatewayProfile,
    ): Promise<Connection> {
        const info = snapshot.profiles.find((p) => p.name === name);
        if (info === undefined) {
            throw new Error(`Profile '${name}' doesn't exist.`);
        }
        if (info.host === undefined) {
            throw new Error(`Profile '${name}' has no valid host.`);
        }
        if (saved !== undefined && info.host !== hostKey(saved.host)) {
            throw new Error(
                `Profile '${name}' now points at ${info.host}, not ${hostKey(saved.host)}.`,
            );
        }
        const connection = await openConnection(
            profileTarget(info, this.deps.sources),
            { kind: "unityGateway" },
            this.deps,
            signal,
        );
        if (saved?.workspaceId !== undefined && connection.workspaceId !== saved.workspaceId) {
            throw new Error(
                `Profile '${name}' now points at workspace ${connection.workspaceId ?? "unknown"}, not ${saved.workspaceId}.`,
            );
        }
        return connection;
    }

    /** The profiles as last read, or read now if that failed or nothing has read them yet. */
    private async loadedProfiles(): Promise<ProfilesSnapshot> {
        const state = await this.deps.profiles.snapshot.settled();
        return state.status === "ready"
            ? state.value
            : this.deps.profiles.refresh("Unity Gateway restore");
    }

    /** The host of a profile as last read. */
    private profileHost(profile: string): string | undefined {
        return this.deps.profiles.snapshot.latest?.profiles.find((p) => p.name === profile)?.host;
    }

    /** The state of a connection to `profile` that failed, with the fix its error allows. */
    private failed(profile: string, host: string | undefined, error: unknown): FailedState {
        const authType = this.deps.profiles.snapshot.latest?.profiles.find(
            (p) => p.name === profile,
        )?.authType;
        return failedState({ profile, host, error, remedy: connectRemedy(authType, error) });
    }

    private begin(): { generation: number; signal: AbortSignal } {
        this.controller?.abort();
        this.controller = new AbortController();
        this.copying = false;
        return { generation: ++this.generation, signal: this.controller.signal };
    }

    /** A newer attempt or a sign-out took over. */
    private ensureLatest(generation: number): void {
        if (generation !== this.generation) {
            throw new CancelledError();
        }
    }

    dispose(): void {
        this.controller?.abort();
        disposeAll(this.disposables);
        this.models.dispose();
        this.current.dispose();
    }
}
