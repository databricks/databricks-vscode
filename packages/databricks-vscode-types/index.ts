import type { Event, Uri } from "vscode";

/**
 * The API of the Databricks extension (`databricks.databricks`), returned by
 * its `activate`:
 *
 * ```ts
 * const api = await vscode.extensions.getExtension<PublicApi>("databricks.databricks")?.activate();
 * ```
 *
 * It names no SDK types, so it doesn't change when the SDK does. Build SDK
 * clients of your own from `connection.profile` and `configFile`, or send
 * requests with `getAuthHeaders()`.
 *
 * NOTE: Whenever the API has incompatible changes the version number MUST be incremented.
 */
export interface PublicApi {
    readonly version: 2;
    /** The window's workspace connection; undefined while signed out or connecting. */
    readonly connection: ConnectionInfo | undefined;
    /** Fires when `connection` changes. */
    readonly onDidChangeConnection: Event<void>;
    /** Authorization headers for a request to `connection.host`. Rejects while signed out. */
    getAuthHeaders(): Promise<Record<string, string>>;
    /** The Databricks CLI the extension runs. */
    readonly cliPath: string;
    /** The Databricks config file the extension reads profiles from. */
    readonly configFile: string;
    /**
     * The members of the version 1 API that known consumers read, for one
     * release. It has no SDK clients: `workspaceClient` and `apiClient` only
     * offer `host` and `config.authenticate`.
     *
     * @deprecated Use the members above.
     */
    readonly connectionManager: ConnectionManagerV1;
}

export interface ConnectionInfo {
    readonly host: string;
    readonly workspaceId?: string;
    /** Undefined in remote mode, where the credentials come from the environment. */
    readonly profile?: string;
    readonly authType: string;
    readonly userName: string;
}

/** @deprecated The version 1 connection states. */
export type ConnectionState = "CONNECTED" | "CONNECTING" | "DISCONNECTED";

/** @deprecated The version 1 API client, reduced to what consumers read. */
export interface ApiClientV1 {
    /** The workspace URL. */
    readonly host: Promise<URL>;
    readonly config: {
        /** Sets the authorization headers on `headers`: a `Headers`, a `Map`, or a plain object. */
        authenticate(
            headers: { set(name: string, value: string): unknown } | Record<string, string>,
        ): Promise<void>;
    };
}

/** @deprecated */
export interface ConnectionManagerV1 {
    readonly onDidChangeState: Event<ConnectionState>;
    /** Resolves once connected; with `interactive`, signs in first when signed out. */
    login(interactive?: boolean, force?: boolean): Promise<void>;
    /** Resolves once connected. */
    waitForConnect(): Promise<void>;
    readonly state: ConnectionState;
    /** The attached cluster of the active project. */
    readonly cluster:
        | {
              readonly id: string;
              readonly details: {
                  readonly cluster_id: string;
                  readonly cluster_name?: string;
                  readonly state?: string;
                  readonly spark_version?: string;
              };
          }
        | undefined;
    /** Serverless is the project's compute. */
    readonly serverless: boolean;
    readonly workspaceClient: { readonly apiClient: ApiClientV1 } | undefined;
    readonly apiClient: ApiClientV1 | undefined;
    readonly workspaceFolderManager: { readonly activeProjectUri: Uri | undefined };
}
