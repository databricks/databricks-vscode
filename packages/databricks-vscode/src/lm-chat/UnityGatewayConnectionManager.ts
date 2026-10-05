import {EventEmitter} from "vscode";
import type {Disposable, Event} from "vscode";
import {logging} from "@databricks/sdk-experimental";
import type {ApiClient} from "@databricks/sdk-experimental";
import type {CliWrapper} from "../cli/CliWrapper";
import {ProfileAuthProvider} from "../configuration/auth/AuthProvider";
import type {DatabricksWorkspace} from "../configuration/DatabricksWorkspace";
import {WorkspaceConnectionModel} from "../configuration/models/WorkspaceConnectionModel";
import type {ConnectionState} from "../configuration/models/WorkspaceConnectionModel";
import {Mutex} from "../locking";
import {Loggers} from "../logger";
import type {StateStorage} from "../vscode-objs/StateStorage";

/**
 * The user's Unity Gateway sign-in. It is separate from the bundle project's
 * sign-in (it may target another workspace), works with no folder open, and is
 * remembered across windows by profile name. Unity Gateway features reach the
 * workspace client through this class, as bundle features do through
 * `ConnectionManager`.
 */
export class UnityGatewayConnectionManager implements Disposable {
    private readonly mutex = new Mutex();
    private readonly connection = new WorkspaceConnectionModel();

    private readonly _onDidChange = new EventEmitter<void>();
    /** Fires when the state or the saved profile changes. */
    readonly onDidChange: Event<void> = this._onDidChange.event;

    private readonly disposables: Disposable[] = [
        this.connection,
        this._onDidChange,
        this.connection.onDidChangeState(() => this._onDidChange.fire()),
    ];

    constructor(
        private readonly cli: CliWrapper,
        private readonly stateStorage: StateStorage,
        private readonly fromProfile = (profile: string, cli: CliWrapper) =>
            ProfileAuthProvider.from(profile, cli)
    ) {}

    get state(): ConnectionState {
        return this.connection.state;
    }

    get databricksWorkspace(): DatabricksWorkspace | undefined {
        return this.connection.databricksWorkspace;
    }

    get apiClient(): ApiClient | undefined {
        return this.connection.apiClient;
    }

    /** Whether a profile is saved, even if restoring it failed. */
    get signedIn(): boolean {
        return (
            this.stateStorage.get("databricks.unityGateway.profile") !==
            undefined
        );
    }

    /**
     * Connects with an already checked sign-in and remembers its profile. If
     * opening the workspace or saving the profile fails, it disconnects, keeps
     * any profile saved before, and rethrows.
     */
    @Mutex.synchronise("mutex")
    async signIn(authProvider: ProfileAuthProvider): Promise<void> {
        await this.connect(authProvider, () =>
            this.stateStorage.set(
                "databricks.unityGateway.profile",
                authProvider.profile
            )
        );
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
        if (this.state === "CONNECTED" || profile === undefined) {
            return;
        }
        try {
            await this.connect(await this.fromProfile(profile, this.cli));
        } catch (e) {
            logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                `Can't restore the Unity Gateway sign-in with profile ${profile}`,
                e
            );
        }
    }

    /** Drops the connection but keeps the profile, so restore() can reconnect. */
    @Mutex.synchronise("mutex")
    async disconnect(): Promise<void> {
        this.connection.disconnect();
    }

    @Mutex.synchronise("mutex")
    async signOut(): Promise<void> {
        await this.stateStorage.set(
            "databricks.unityGateway.profile",
            undefined
        );
        if (this.state === "DISCONNECTED") {
            // Only the saved profile changed, e.g. after a failed restore.
            this._onDidChange.fire();
        }
        this.connection.disconnect();
    }

    private async connect(
        authProvider: ProfileAuthProvider,
        save?: () => Promise<void>
    ): Promise<void> {
        await this.connection.connect(authProvider, save);
        logging.NamedLogger.getOrCreate(Loggers.Extension).info(
            `Connected to Unity Gateway on ${authProvider.host.toString()}`
        );
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
