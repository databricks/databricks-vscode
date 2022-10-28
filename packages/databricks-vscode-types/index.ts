import {ApiClient} from "@databricks/databricks-sdk";
import {Cluster} from "@databricks/databricks-sdk";
import {Event} from "vscode";
export type ConnectionState = "CONNECTED" | "CONNECTING" | "DISCONNECTED";

export interface PublicApi {
    connectionManager: {
        onDidChangeState: Event<ConnectionState>;

        get state(): ConnectionState;
        get cluster(): Cluster | undefined;
        get apiClient(): ApiClient | undefined;

        waitForConnect(): Promise<void>;
    };
}
