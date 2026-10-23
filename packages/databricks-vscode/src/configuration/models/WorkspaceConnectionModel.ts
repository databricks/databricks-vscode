import {EventEmitter} from "vscode";
import type {Disposable, Event} from "vscode";
import type {ApiClient, WorkspaceClient} from "@databricks/sdk-experimental";
import type {AuthProvider} from "../auth/AuthProvider";
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

    private readonly _onDidChangeState = new EventEmitter<ConnectionState>();
    /** Fires when the state changes. */
    readonly onDidChangeState: Event<ConnectionState> =
        this._onDidChangeState.event;

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
     * Drops the current workspace, opens the new one and makes it current, runs
     * `setup`, then reports CONNECTED. If opening or `setup` fails, this
     * disconnects and rethrows.
     */
    async connect(
        authProvider: AuthProvider,
        setup?: () => Promise<void>
    ): Promise<void> {
        this.clearWorkspace();
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
        this.clearWorkspace();
        this.setState("DISCONNECTED");
    }

    /**
     * Reports CONNECTING for a sign-in that has started but doesn't have its
     * auth provider yet. connect() then carries on from CONNECTING.
     */
    beginConnecting() {
        this.setState("CONNECTING");
    }

    private clearWorkspace() {
        this._workspaceClient = undefined;
        this._databricksWorkspace = undefined;
    }

    private setState(state: ConnectionState) {
        if (this._state !== state) {
            this._state = state;
            this._onDidChangeState.fire(state);
        }
    }

    dispose() {
        this._onDidChangeState.dispose();
    }
}
