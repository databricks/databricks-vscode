import {Disposable, Event, EventEmitter} from "vscode";
import {
    ApiClient,
    WorkspaceClient,
    logging,
} from "@databricks/sdk-experimental";
import {CliWrapper} from "../cli/CliWrapper";
import {ProfileAuthProvider} from "../configuration/auth/AuthProvider";
import type {ConnectionState} from "../configuration/ConnectionManager";
import {DatabricksWorkspace} from "../configuration/DatabricksWorkspace";
import {Mutex} from "../locking";
import {Loggers} from "../logger";
import {StateStorage} from "../vscode-objs/StateStorage";

/**
 * The user's Unity Gateway sign-in. It is separate from the bundle project's
 * sign-in (it may target another workspace), works with no folder open, and is
 * remembered across windows by profile name. Unity Gateway features reach the
 * workspace client through this class, as bundle features do through
 * `ConnectionManager`.
 */
export class UnityGatewayConnectionManager implements Disposable {
    private readonly mutex = new Mutex();
    private _state: ConnectionState = "DISCONNECTED";
    private workspaceClient?: WorkspaceClient;
    private _databricksWorkspace?: DatabricksWorkspace;

    private readonly _onDidChange = new EventEmitter<void>();
    /** Fires when the state, the connected workspace or the saved profile changes. */
    readonly onDidChange: Event<void> = this._onDidChange.event;

    constructor(
        private readonly cli: CliWrapper,
        private readonly stateStorage: StateStorage,
        private readonly fromProfile = (profile: string, cli: CliWrapper) =>
            ProfileAuthProvider.from(profile, cli)
    ) {}

    get state(): ConnectionState {
        return this._state;
    }

    get databricksWorkspace(): DatabricksWorkspace | undefined {
        return this._databricksWorkspace;
    }

    get apiClient(): ApiClient | undefined {
        return this.workspaceClient?.apiClient;
    }

    /** Whether a profile is saved, even if restoring it failed. */
    get signedIn(): boolean {
        return (
            this.stateStorage.get("databricks.unityGateway.profile") !==
            undefined
        );
    }

    /**
     * Connects with an already checked sign-in and remembers its profile. On
     * failure the previous connection, if any, is kept and the error rethrown.
     */
    @Mutex.synchronise("mutex")
    async signIn(authProvider: ProfileAuthProvider): Promise<void> {
        await this.connect(authProvider);
        await this.stateStorage.set(
            "databricks.unityGateway.profile",
            authProvider.profile
        );
        this._onDidChange.fire();
    }

    /**
     * Reconnects with the remembered profile, without any UI. A failure is
     * logged and leaves the profile for the next restore. No-op when connected
     * or nothing is saved.
     */
    @Mutex.synchronise("mutex")
    async restore(): Promise<void> {
        const profile = this.stateStorage.get(
            "databricks.unityGateway.profile"
        );
        if (this._state === "CONNECTED" || profile === undefined) {
            return;
        }
        try {
            await this.connect(await this.fromProfile(profile, this.cli));
        } catch (e) {
            logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                `Can't restore the Unity Gateway sign-in with profile ${profile}`,
                e
            );
            return;
        }
        this._onDidChange.fire();
    }

    /** Drops the connection but keeps the profile, so restore() can reconnect. */
    @Mutex.synchronise("mutex")
    async disconnect(): Promise<void> {
        this.dropConnection();
    }

    @Mutex.synchronise("mutex")
    async signOut(): Promise<void> {
        await this.stateStorage.set(
            "databricks.unityGateway.profile",
            undefined
        );
        this.dropConnection();
    }

    /** Fires even when already disconnected, e.g. after a failed restore. */
    private dropConnection() {
        this.workspaceClient = undefined;
        this._databricksWorkspace = undefined;
        this._state = "DISCONNECTED";
        this._onDidChange.fire();
    }

    private async connect(authProvider: ProfileAuthProvider): Promise<void> {
        if (this._state === "DISCONNECTED") {
            this.updateState("CONNECTING");
        }
        try {
            const workspaceClient = await authProvider.getWorkspaceClient();
            const databricksWorkspace = await DatabricksWorkspace.load(
                workspaceClient,
                authProvider
            );
            this.workspaceClient = workspaceClient;
            this._databricksWorkspace = databricksWorkspace;
        } catch (e) {
            if (this._state === "CONNECTING") {
                this.updateState("DISCONNECTED");
            }
            throw e;
        }
        logging.NamedLogger.getOrCreate(Loggers.Extension).info(
            `Connected to Unity Gateway on ${authProvider.host.toString()}`
        );
        // The caller fires the change once it has finished (e.g. saved the
        // profile), so listeners see the final state.
        this._state = "CONNECTED";
    }

    private updateState(state: ConnectionState) {
        if (this._state !== state) {
            this._state = state;
            this._onDidChange.fire();
        }
    }

    dispose() {
        this._onDidChange.dispose();
    }
}
