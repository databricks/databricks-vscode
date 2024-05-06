import {ApiClient, WorkspaceClient} from "@databricks/databricks-sdk";
import {Cluster} from "databricks/src/sdk-extensions";
import {Event} from "vscode";
export type ConnectionState = "CONNECTED" | "CONNECTING" | "DISCONNECTED";

/**
 * NOTE: Whenever the API has incompatible changes the version number MUST be incremented.
 */
export interface PublicApi {
    version: 1;

    connectionManager: {
        onDidChangeState: Event<ConnectionState>;

        login(interactive?: boolean, force?: boolean): Promise<void>;
        waitForConnect(): Promise<void>;

        get state(): ConnectionState;
        get cluster(): Cluster | undefined;
        get workspaceClient(): WorkspaceClient | undefined;
        get apiClient(): ApiClient | undefined;
    };
}
