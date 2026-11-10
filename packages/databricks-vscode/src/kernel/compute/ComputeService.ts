import { AccessManagementClient } from "@databricks/sdk-accessmanagement/v1";
import { ClustersClient } from "@databricks/sdk-clusters/v2";
import { ScimClient } from "@databricks/sdk-scim/v1";
import { isCancellation } from "../../platform/errors";
import { disposeAll, type Disposable, type Event } from "../../platform/event";
import type { Logger } from "../../platform/log";
import { MutableState, type ResourceState, type State } from "../../platform/reactive";
import { setting, type Settings } from "../../platform/settings";
import { sleep } from "../../platform/timers";
import type { ValidatedBundle } from "../bundle/BundleService";
import { calls } from "../connection/ApiClients";
import { ClusterListClient } from "../connection/ClusterListClient";
import type { Connection, ConnectionState } from "../connection/ConnectionService";
import type { SessionCompute } from "../host/Host";
import type { ProjectSnapshot } from "../project/ProjectService";
import type { Overrides } from "../project/TargetFiles";
import { fromClusterInfo, isSingleUser, type ClusterDetails } from "./clusters";
import {
    effectiveCompute,
    overridesFor,
    type Compute,
    type ComputeChoice,
} from "./effectiveCompute";

/** `databricks.clusters.onlyShowAccessibleClusters` (COMP-07): only clusters the user can run code on. */
const ONLY_ACCESSIBLE_CLUSTERS = setting<boolean>(
    "databricks",
    "clusters.onlyShowAccessibleClusters",
    false,
);

/** The attached cluster's details, as last read. */
export interface AttachedCluster {
    readonly clusterId: string;
    /** Undefined until the first read succeeds. */
    readonly details?: ClusterDetails;
    /** The last read failed. */
    readonly error?: Error;
}

/** The workspace's clusters, as they arrive. */
export interface ClusterList {
    readonly status: "idle" | "loading" | "ready" | "error";
    readonly clusters: readonly ClusterDetails[];
    readonly error?: Error;
}

export interface ComputeServiceDeps {
    readonly project: State<ProjectSnapshot>;
    /** Writes keys of the active target's overrides, all at once. */
    readonly saveOverrides: (patch: Partial<Overrides>) => Promise<void>;
    readonly validated: State<ResourceState<ValidatedBundle>> & {
        readonly latest: ValidatedBundle | undefined;
    };
    readonly connection: State<ConnectionState>;
    readonly settings: Settings;
    readonly log: Logger;
    /** The compute a session window runs on, if any. */
    readonly session?: SessionCompute;
    /**
     * Whether serverless is the default when nothing is chosen: a window whose identity is a
     * profile (local, or compute without a session). A session window's compute is the tunnel's.
     */
    readonly defaultServerless: boolean;
    /**
     * Whether the target's saved choices (`vscode.overrides.json`) apply: `capabilities.compute` is
     * `perTarget`. In a session they don't, since its compute is the window's and can't change.
     */
    readonly choosesCompute: boolean;
    /** How often the attached cluster is read while observed. The old `ClusterManager` read it every 10 seconds. */
    readonly pollIntervalMs?: number;
    /** How often a starting or stopping cluster is read. */
    readonly progressIntervalMs?: number;
}

/** The old `Cluster.start`'s messages. */
class ClusterError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ClusterError";
    }
}

/** Starting or stopping lets readers follow the state. */
export interface ClusterActionOptions {
    readonly signal?: AbortSignal;
    readonly onProgress?: (cluster: ClusterDetails) => void;
}

/**
 * Compute (COMP-01 to COMP-07): which compute is effective
 * for the active target, the attached cluster's state, the workspace's
 * clusters, and the choices the user makes. Replaces the compute half of
 * the old `ConnectionManager`, and `ClusterManager`, `ClusterLoader` and
 * `ClusterModel`. It shows nothing; `features/compute` does.
 */
export class ComputeService implements Disposable {
    private readonly effectiveState = new MutableState<Compute | undefined>(undefined);
    /** Explicit choice > bundle `cluster_id` > profile `serverless_compute_id = auto`. */
    readonly effective: State<Compute | undefined> = this.effectiveState;

    private readonly attached = new MutableState<AttachedCluster | undefined>(undefined);
    private observers = 0;
    private poll?: { clusterId: string; api: Connection["api"]; controller: AbortController };
    /**
     * The cluster that `effective` names, read only while something listens
     * to it: the Cluster row does while it shows. Reading `value` never
     * starts a request.
     */
    readonly attachedCluster: State<AttachedCluster | undefined>;

    private readonly list = new MutableState<ClusterList>({ status: "idle", clusters: [] });
    /** Loaded by `refreshClusters`: when the picker opens, and while the Compute view shows. Never in the background. */
    readonly clusters: State<ClusterList> = this.list;
    private listing?: { controller: AbortController; done: Promise<void> };

    /**
     * Whether choosing Serverless asks for an environment version (COMP-02).
     * The Python feature sets it while the uv setup is the project's surface;
     * until then it stays false, and Serverless has no version.
     */
    readonly serverlessVersionRequired = new MutableState(false);

    /**
     * The compute a session window runs on: interactive code here runs on
     * it, and stopping it ends the session. Undefined in a local window. In a
     * session, `effective` is the bundle's own `cluster_id` or nothing: the
     * saved choices don't apply.
     */
    readonly session: SessionCompute | undefined;

    private api?: Connection["api"];
    private readonly disposables: Disposable[] = [];
    private started = false;

    constructor(private readonly deps: ComputeServiceDeps) {
        this.session = deps.session;
        const onDidChange: Event<AttachedCluster | undefined> = (
            listener,
            thisArgs?,
            disposables?,
        ) => {
            const subscription = this.attached.onDidChange(listener, thisArgs);
            this.observers++;
            this.updatePolling();
            let disposed = false;
            const result = {
                dispose: () => {
                    if (!disposed) {
                        disposed = true;
                        subscription.dispose();
                        this.observers--;
                        this.updatePolling();
                    }
                },
            };
            disposables?.push(result);
            return result;
        };
        const attached = this.attached;
        this.attachedCluster = {
            get value() {
                return attached.value;
            },
            onDidChange,
        };
    }

    /** Starts following the project, validate and the connection. Call from `start`. */
    start(): void {
        if (this.started) {
            return;
        }
        this.started = true;
        this.disposables.push(
            this.deps.project.onDidChange(() => this.update()),
            this.deps.validated.onDidChange(() => this.update()),
            this.deps.connection.onDidChange(() => this.update()),
        );
        this.update();
    }

    private get connection(): Connection | undefined {
        const s = this.deps.connection.value;
        return s.status === "connected" ? s.connection : undefined;
    }

    /** Another workspace, or none: its clusters and their states are gone. */
    private syncConnection(): Connection | undefined {
        const connection = this.connection;
        if (connection?.api !== this.api) {
            this.api = connection?.api;
            this.listing?.controller.abort();
            this.listing = undefined;
            this.list.set({ status: "idle", clusters: [] });
        }
        return connection;
    }

    /** The bundle's cluster for the active target, as validate reports it. */
    private bundleClusterId(): string | undefined {
        const project = this.deps.project.value;
        const validated = this.deps.validated.latest;
        const current =
            validated !== undefined &&
            validated.root === project.project?.root &&
            validated.target === project.target;
        const bundle = current ? validated.config.bundle : undefined;
        return bundle?.compute_id ?? bundle?.cluster_id;
    }

    private update() {
        const connection = this.syncConnection();
        const project = this.deps.project.value;
        this.effectiveState.set(
            project.project === undefined || project.target === undefined
                ? undefined
                : effectiveCompute({
                      overrides: this.deps.choosesCompute ? project.overrides : undefined,
                      bundleClusterId: this.bundleClusterId(),
                      serverlessComputeId: connection?.serverlessComputeId,
                      defaultServerless: connection !== undefined && this.deps.defaultServerless,
                  }),
        );
        const effective = this.effective.value;
        const clusterId = effective?.kind === "cluster" ? effective.clusterId : undefined;
        if (clusterId === undefined) {
            this.attached.set(undefined);
        } else if (this.attached.value?.clusterId !== clusterId) {
            this.attached.set({ clusterId });
        }
        this.updatePolling();
    }

    /** Reads the attached cluster now and then periodically, while it is observed and connected. */
    private updatePolling() {
        const clusterId = this.attached.value?.clusterId;
        const api = this.connection?.api;
        const wanted =
            this.started && this.observers > 0 && clusterId !== undefined && api !== undefined;
        if (wanted && this.poll?.clusterId === clusterId && this.poll.api === api) {
            return;
        }
        this.poll?.controller.abort();
        this.poll = undefined;
        if (!wanted) {
            return;
        }
        const controller = new AbortController();
        this.poll = { clusterId, api, controller };
        void this.pollLoop(clusterId, api, controller.signal);
    }

    private async pollLoop(clusterId: string, api: Connection["api"], signal: AbortSignal) {
        try {
            while (!signal.aborted) {
                await this.readAttached(clusterId, api, signal);
                await sleep(this.deps.pollIntervalMs ?? 10_000, signal);
            }
        } catch (e) {
            if (!isCancellation(e)) {
                this.deps.log.error("Polling the attached cluster failed", e);
            }
        }
    }

    private async readAttached(clusterId: string, api: Connection["api"], signal: AbortSignal) {
        try {
            const details = fromClusterInfo(
                await api.get(ClustersClient).getCluster({ clusterId }, calls.read({ signal })),
            );
            this.publish(details);
        } catch (e) {
            if (isCancellation(e) || signal.aborted) {
                return;
            }
            this.deps.log.warn(`Can't read cluster ${clusterId}`, e);
            const current = this.attached.value;
            if (current?.clusterId === clusterId) {
                this.attached.set({
                    ...current,
                    error: e instanceof Error ? e : new Error(String(e)),
                });
            }
        }
    }

    /** A fresh read of a cluster: the attached one, and its entry in the list, show it at once. */
    private publish(details: ClusterDetails) {
        if (this.attached.value?.clusterId === details.id) {
            this.attached.set({ clusterId: details.id, details });
        }
        const list = this.list.value;
        if (list.clusters.some((c) => c.id === details.id)) {
            this.list.set({
                ...list,
                clusters: list.clusters.map((c) => (c.id === details.id ? details : c)),
            });
        }
    }

    /**
     * Lists the workspace's clusters into `clusters`, as they arrive. A
     * second call aborts the first. With `onlyShowAccessibleClusters`, a
     * cluster shows once the user's access to it is confirmed. Resolves when
     * the list is complete.
     */
    refreshClusters(): Promise<void> {
        // Listeners of the connection may ask before this service has seen it.
        const connection = this.syncConnection();
        this.listing?.controller.abort();
        if (connection === undefined) {
            this.listing = undefined;
            this.list.set({ status: "idle", clusters: [] });
            return Promise.resolve();
        }
        const controller = new AbortController();
        const done = this.loadClusters(connection, controller.signal);
        this.listing = { controller, done };
        return done;
    }

    private async loadClusters(connection: Connection, signal: AbortSignal): Promise<void> {
        // The previous list shows until the first cluster of this one arrives.
        const previous = this.list.value.clusters;
        this.list.set({ status: "loading", clusters: previous });
        const found: ClusterDetails[] = [];
        const accessibleOnly = this.deps.settings.get(ONLY_ACCESSIBLE_CLUSTERS);
        const emit = (cluster: ClusterDetails) => {
            if (!signal.aborted) {
                found.push(cluster);
                this.list.set({ status: "loading", clusters: [...found] });
            }
        };
        try {
            const listed: ClusterDetails[] = [];
            for await (const cluster of connection.api
                .get(ClusterListClient)
                .listIter(calls.read({ signal }))) {
                if (accessibleOnly) {
                    listed.push(cluster);
                } else {
                    emit(cluster);
                }
            }
            if (accessibleOnly) {
                await this.keepAccessible(connection, listed, emit, signal);
            }
            if (!signal.aborted) {
                this.list.set({ status: "ready", clusters: [...found] });
            }
        } catch (e) {
            if (signal.aborted || isCancellation(e)) {
                return;
            }
            this.deps.log.error("Error loading clusters", e);
            this.list.set({
                status: "error",
                clusters: [...found],
                error: e instanceof Error ? e : new Error(String(e)),
            });
        }
    }

    /**
     * The old `ClusterLoader`'s check, 50 at a time: a single-user cluster
     * must be the user's; any other must grant the user, one of their
     * groups, or `users` some permission. The Repos-era runtime filter
     * (`supportFilesInReposForCluster`) is gone.
     */
    private async keepAccessible(
        connection: Connection,
        clusters: readonly ClusterDetails[],
        emit: (c: ClusterDetails) => void,
        signal: AbortSignal,
    ) {
        let groups: string[] | undefined;
        const userGroups = async () => {
            if (groups === undefined) {
                const me = await connection.api.get(ScimClient).me({}, calls.read({ signal }));
                groups = (me.groups ?? [])
                    .map((g) => g.display)
                    .filter((d): d is string => d !== undefined);
            }
            return groups;
        };
        const check = async (cluster: ClusterDetails): Promise<boolean> => {
            if (isSingleUser(cluster)) {
                return cluster.singleUserName === connection.userName;
            }
            const mine = await userGroups();
            const permissions = await connection.api
                .get(AccessManagementClient)
                .getObjectPermissions(
                    { requestObjectType: "clusters", requestObjectId: cluster.id },
                    calls.read({ signal }),
                );
            return (permissions.accessControlList ?? []).some((ac) => {
                const principal = ac.principalName;
                if (principal?.$case === "userName") {
                    return principal.userName === connection.userName;
                }
                if (principal?.$case === "groupName") {
                    // `users` is the system group of all workspace users.
                    return principal.groupName === "users" || mine.includes(principal.groupName);
                }
                return false;
            });
        };
        const queue = [...clusters];
        const worker = async () => {
            for (
                let cluster = queue.shift();
                cluster !== undefined && !signal.aborted;
                cluster = queue.shift()
            ) {
                try {
                    if (await check(cluster)) {
                        emit(cluster);
                    }
                } catch (e) {
                    if (signal.aborted) {
                        return;
                    }
                    this.deps.log.error(`Error fetching permission for cluster ${cluster.name}`, e);
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(50, queue.length) }, worker));
    }

    /**
     * Writes the choice to the target's `vscode.overrides.json` (COMP-04);
     * `effective` shows it when this resolves.
     */
    async select(choice: ComputeChoice): Promise<void> {
        // A detach stores "no compute" only where the default would otherwise fill the target.
        const fillsOnDetach =
            this.connection !== undefined &&
            this.deps.defaultServerless &&
            (this.bundleClusterId() ?? "") === "";
        await this.deps.saveOverrides(
            overridesFor(choice, this.effective.value, { fillsOnDetach }),
        );
    }

    /**
     * The serverless version, picked during setup. It's stored alone: the target keeps the
     * compute it has, so a serverless default stays a default and a detach still holds.
     */
    async setServerlessVersion(version: string): Promise<void> {
        await this.deps.saveOverrides({ serverlessVersion: version });
    }

    /** "Override Jobs cluster in bundle" (COMP-06). */
    async setUseClusterOverride(enabled: boolean): Promise<void> {
        await this.deps.saveOverrides({ useClusterOverride: enabled });
    }

    /** One cluster's details, now. */
    async getCluster(clusterId: string, signal?: AbortSignal): Promise<ClusterDetails> {
        const details = fromClusterInfo(
            await this.requireConnection()
                .api.get(ClustersClient)
                .getCluster({ clusterId }, calls.read({ signal })),
        );
        this.publish(details);
        return details;
    }

    /**
     * Starts a cluster and waits until it runs (COMP-05), as the old
     * `Cluster.start`: a running cluster is left alone, a terminating one is
     * waited for first. The SDK's waiter isn't used: it would fail on a
     * `TERMINATED` read before the start shows, and reports no progress.
     */
    async startCluster(
        clusterId: string,
        options: ClusterActionOptions = {},
    ): Promise<ClusterDetails> {
        const connection = this.requireConnection();
        const client = connection.api.get(ClustersClient);
        const read = async () => {
            const details = fromClusterInfo(
                await client.getCluster({ clusterId }, calls.read({ signal: options.signal })),
            );
            this.publish(details);
            options.onProgress?.(details);
            return details;
        };
        let cluster = await read();
        if (cluster.state === "RUNNING") {
            return cluster;
        }
        const deadline = Date.now() + 60_000;
        while (cluster.state === "TERMINATING" && Date.now() < deadline) {
            await sleep(this.deps.progressIntervalMs ?? 3_000, options.signal);
            cluster = await read();
        }
        if (["TERMINATED", "TERMINATING", "ERROR", "UNKNOWN"].includes(cluster.state)) {
            await client.startCluster({ clusterId }, calls.write({ signal: options.signal }));
        }
        for (;;) {
            cluster = await read();
            switch (cluster.state) {
                case "RUNNING":
                    return cluster;
                case "TERMINATED":
                    throw new ClusterError(
                        `Cluster[${cluster.name}]: CurrentState - Terminated; Reason - ${cluster.stateMessage ?? ""}`,
                    );
                case "ERROR":
                    throw new ClusterError(
                        `Cluster[${cluster.name}]: Error in starting the cluster (${cluster.stateMessage ?? ""})`,
                    );
            }
            await sleep(this.deps.progressIntervalMs ?? 3_000, options.signal);
        }
    }

    /** Terminates a cluster (`clusters/delete`) and waits until it has stopped. */
    async stopCluster(
        clusterId: string,
        options: ClusterActionOptions = {},
    ): Promise<ClusterDetails> {
        const connection = this.requireConnection();
        const client = connection.api.get(ClustersClient);
        await client.deleteCluster({ clusterId }, calls.write({ signal: options.signal }));
        for (;;) {
            const cluster = fromClusterInfo(
                await client.getCluster({ clusterId }, calls.read({ signal: options.signal })),
            );
            this.publish(cluster);
            options.onProgress?.(cluster);
            if (cluster.state === "TERMINATED" || cluster.state === "ERROR") {
                return cluster;
            }
            await sleep(this.deps.progressIntervalMs ?? 3_000, options.signal);
        }
    }

    private requireConnection(): Connection {
        const connection = this.connection;
        if (connection === undefined) {
            throw new Error("Not connected to a Databricks workspace.");
        }
        return connection;
    }

    dispose(): void {
        this.poll?.controller.abort();
        this.listing?.controller.abort();
        disposeAll(this.disposables);
        this.effectiveState.dispose();
        this.attached.dispose();
        this.list.dispose();
        this.serverlessVersionRequired.dispose();
    }
}
