import type {
    ApiClientV1,
    ConnectionInfo,
    ConnectionManagerV1,
    ConnectionState,
    PublicApi,
} from "@databricks/databricks-vscode-types";
import { Uri, type Disposable } from "vscode";
import type { Kernel } from "./kernel/feature";
import type { ConnectionState as KernelConnectionState } from "./kernel/connection/ConnectionService";
import { Emitter } from "./platform/event";

export type { PublicApi };

const v1State = (s: KernelConnectionState): ConnectionState =>
    s.status === "connected"
        ? "CONNECTED"
        : s.status === "connecting"
          ? "CONNECTING"
          : "DISCONNECTED";

/**
 * The API other extensions get from `activate` (INFRA-08):
 * version 2, without SDK types, over the kernel's connection. The version 1
 * `connectionManager` is kept, reduced to the members known consumers read
 * (the SQLTools driver and paiqo's Databricks extension), for one release.
 */
export function createPublicApi(
    kernel: Kernel,
    signIn: () => Thenable<unknown>,
    subscriptions: Disposable[],
): PublicApi {
    const changed = new Emitter<void>();
    const stateChanged = new Emitter<ConnectionState>();
    let last = kernel.connection.connection;
    // Starts unset so the first change fires, even when it matches the state at
    // creation (usually CONNECTING). After that, fire only on a v1 change.
    let lastState: ConnectionState | undefined;
    const subscription = kernel.connection.state.onDidChange((s) => {
        const nextState = v1State(s);
        // A repeat is the same connection: the kernel goes through CONNECTING between connections.
        if (nextState !== lastState) {
            lastState = nextState;
            stateChanged.fire(nextState);
        }
        const next = kernel.connection.connection;
        if (next !== last) {
            last = next;
            changed.fire();
        }
    });
    subscriptions.push(subscription, changed, stateChanged);

    const connection = (): ConnectionInfo | undefined => {
        const c = kernel.connection.connection;
        return c === undefined
            ? undefined
            : {
                  host: c.host,
                  ...(c.workspaceId !== undefined ? { workspaceId: c.workspaceId } : {}),
                  ...(c.profile !== undefined ? { profile: c.profile } : {}),
                  authType: c.authType,
                  userName: c.userName,
              };
    };

    const getAuthHeaders = async (): Promise<Record<string, string>> => {
        const c = kernel.connection.connection;
        if (c === undefined) {
            throw new Error("Not connected to a Databricks workspace.");
        }
        return c.api.authHeaders();
    };

    /** Resolves once connected; rejects when the connection settles in another state. */
    const waitForConnect = async (): Promise<void> => {
        while (kernel.connection.state.value.status === "connecting") {
            await new Promise<void>((resolve) => {
                const once = kernel.connection.state.onDidChange(() => {
                    once.dispose();
                    resolve();
                });
            });
        }
        if (kernel.connection.connection === undefined) {
            throw new Error("Not connected to a Databricks workspace.");
        }
    };

    const apiClient = (): ApiClientV1 | undefined => {
        const c = kernel.connection.connection;
        if (c === undefined) {
            return undefined;
        }
        return {
            host: Promise.resolve(new URL(c.host)),
            config: {
                authenticate: async (headers) => {
                    const values = await c.api.authHeaders();
                    for (const [name, value] of Object.entries(values)) {
                        if (typeof headers.set === "function") {
                            (headers as { set(name: string, value: string): unknown }).set(
                                name,
                                value,
                            );
                        } else {
                            (headers as Record<string, string>)[name] = value;
                        }
                    }
                },
            },
        };
    };

    const connectionManager: ConnectionManagerV1 = {
        onDidChangeState: stateChanged.event,
        async login(interactive = false) {
            if (kernel.connection.state.value.status === "connecting") {
                await waitForConnect().catch(() => {});
            }
            if (kernel.connection.connection === undefined && interactive) {
                await signIn();
            }
            await waitForConnect();
        },
        waitForConnect,
        get state() {
            return v1State(kernel.connection.state.value);
        },
        get cluster() {
            const attached = kernel.compute.attachedCluster.value;
            if (attached === undefined) {
                return undefined;
            }
            const { details } = attached;
            return {
                id: attached.clusterId,
                details: {
                    cluster_id: attached.clusterId,
                    ...(details !== undefined
                        ? { cluster_name: details.name, state: details.state }
                        : {}),
                    ...(details?.sparkVersion !== undefined
                        ? { spark_version: details.sparkVersion }
                        : {}),
                },
            };
        },
        get serverless() {
            return kernel.compute.effective.value?.kind === "serverless";
        },
        get workspaceClient() {
            const client = apiClient();
            return client === undefined ? undefined : { apiClient: client };
        },
        get apiClient() {
            return apiClient();
        },
        workspaceFolderManager: {
            get activeProjectUri() {
                const root = kernel.project.root.value;
                return root === undefined ? undefined : Uri.file(root);
            },
        },
    };

    return {
        version: 2,
        get connection() {
            return connection();
        },
        onDidChangeConnection: changed.event,
        getAuthHeaders,
        get cliPath() {
            return kernel.cli.cliPath;
        },
        get configFile() {
            return kernel.configFile();
        },
        connectionManager,
    };
}
