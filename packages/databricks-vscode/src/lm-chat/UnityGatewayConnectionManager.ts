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

    /**
     * Whether a profile is saved. It stays saved when restoring it fails, so
     * this can be true while DISCONNECTED.
     */
    get hasSavedProfile(): boolean {
        return (
            this.stateStorage.get("databricks.unityGateway.savedProfile") !==
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
            this.stateStorage.set("databricks.unityGateway.savedProfile", {
                profile: authProvider.profile,
                host: authProvider.host.toString(),
                // Setup steps run once the workspace has loaded.
                workspaceId: this.connection.databricksWorkspace!.id,
            })
        );
    }

    /**
     * Reconnects with the saved profile, without any UI. It skips the profile
     * if it now points at another host or workspace, since the config file can
     * differ between windows. A failure is logged and leaves the profile for
     * the next restore. No-op when connected or nothing is saved.
     */
    @Mutex.synchronise("mutex")
    async restore(): Promise<void> {
        const saved = this.stateStorage.get(
            "databricks.unityGateway.savedProfile"
        );
        if (this.state === "CONNECTED" || saved === undefined) {
            return;
        }
        const logger = logging.NamedLogger.getOrCreate(Loggers.Extension);
        try {
            const authProvider = await this.fromProfile(
                saved.profile,
                this.cli
            );
            const host = authProvider.host.toString();
            if (host !== saved.host) {
                logger.warn(
                    `Not restoring the Unity Gateway sign-in: profile ${saved.profile} now points at ${host}, not ${saved.host}`
                );
                return;
            }
            // On a unified host, several workspaces share the host, so check
            // the workspace too once it has loaded.
            await this.connect(authProvider, async () => {
                const workspaceId = this.connection.databricksWorkspace?.id;
                if (workspaceId !== saved.workspaceId) {
                    throw new Error(
                        `profile ${saved.profile} now points at workspace ${workspaceId}, not ${saved.workspaceId}`
                    );
                }
            });
        } catch (e) {
            logger.error(
                `Can't restore the Unity Gateway sign-in with profile ${saved.profile}`,
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
            "databricks.unityGateway.savedProfile",
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
