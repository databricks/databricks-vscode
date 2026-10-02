import {Disposable, Event, EventEmitter} from "vscode";
import {ApiClient, WorkspaceClient} from "@databricks/sdk-experimental";
import {AuthProvider} from "../auth/AuthProvider";
import {DatabricksWorkspace} from "../DatabricksWorkspace";

export type ConnectionState = "CONNECTED" | "CONNECTING" | "DISCONNECTED";

/**
 * A connection to one Databricks workspace: its state, and the client and
 * workspace it's connected to. The bundle and Unity Gateway connections each own
 * one, so they can point at different workspaces. Owners serialize calls.
 */
export class WorkspaceConnectionModel implements Disposable {
    private _state: ConnectionState = "DISCONNECTED";
    private _workspaceClient?: WorkspaceClient;
    private _databricksWorkspace?: DatabricksWorkspace;

    private readonly onDidChangeStateEmitter =
        new EventEmitter<ConnectionState>();
    /** Fires when the state changes. */
    readonly onDidChangeState: Event<ConnectionState> =
        this.onDidChangeStateEmitter.event;

    get state(): ConnectionState {
        return this._state;
    }

    get workspaceClient(): WorkspaceClient | undefined {
        return this._workspaceClient;
    }

    get databricksWorkspace(): DatabricksWorkspace | undefined {
        return this._databricksWorkspace;
    }

    get apiClient(): ApiClient | undefined {
        return this._workspaceClient?.apiClient;
    }

    /**
     * Opens the workspace and makes it current, runs `setup`, then reports
     * CONNECTED. The current workspace stays current until the new one is open.
     * If opening or `setup` fails, this disconnects and rethrows.
     */
    async connect(
        authProvider: AuthProvider,
        setup?: () => Promise<void>
    ): Promise<void> {
        this.setState("CONNECTING");
        try {
            const workspaceClient = await authProvider.getWorkspaceClient();
            const databricksWorkspace = await DatabricksWorkspace.load(
                workspaceClient,
                authProvider
            );
            this._workspaceClient = workspaceClient;
            this._databricksWorkspace = databricksWorkspace;
            await setup?.();
        } catch (e) {
            this.disconnect();
            throw e;
        }
        this.setState("CONNECTED");
    }

    disconnect() {
        this._workspaceClient = undefined;
        this._databricksWorkspace = undefined;
        this.setState("DISCONNECTED");
    }

    /**
     * Reports CONNECTING for a sign-in that has started but doesn't have its
     * auth provider yet. connect() then carries on from CONNECTING.
     */
    beginConnecting() {
        this.setState("CONNECTING");
    }

    private setState(state: ConnectionState) {
        if (this._state !== state) {
            this._state = state;
            this.onDidChangeStateEmitter.fire(state);
        }
    }

    dispose() {
        this.onDidChangeStateEmitter.dispose();
    }
}
