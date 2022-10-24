/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

import {ApiClient} from "../../api-client";
import * as model from "./model";
import Time from "../../retries/Time";
import retry from "../../retries/retries";
import {CancellationToken} from "../../types";
import {ApiError, ApiRetriableError} from "../apiError";

export class ClustersRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Clusters", method, message);
    }
}
export class ClustersError extends ApiError {
    constructor(method: string, message?: string) {
        super("Clusters", method, message);
    }
}

/**
 * <needs content added>
 */
export class ClustersService {
    constructor(readonly client: ApiClient) {}
    /**
     * Change cluster owner
     *
     * Change the owner of the cluster. You must be an admin to perform this
     * operation.
     */
    async changeOwner(
        request: model.ChangeClusterOwner,
        cancellationToken?: CancellationToken
    ): Promise<model.ChangeClusterOwnerResponse> {
        const path = "/api/2.0/clusters/change-owner";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.ChangeClusterOwnerResponse;
    }

    /**
     * Create new cluster
     *
     * Creates a new Spark cluster. This method will acquire new instances from
     * the cloud provider if necessary. This method is asynchronous; the returned
     * ``cluster_id`` can be used to poll the cluster status. When this method
     * returns, the cluster will be in\na ``PENDING`` state. The cluster will be
     * usable once it enters a ``RUNNING`` state.
     *
     * Note: Databricks may not be able to acquire some of the requested nodes,
     * due to cloud provider limitations (account limits, spot price, etc.) or
     * transient network issues.
     *
     * If Databricks acquires at least 85% of the requested on-demand nodes,
     * cluster creation will succeed. Otherwise the cluster will terminate with
     * an informative error message.
     */
    async create(
        request: model.CreateCluster,
        cancellationToken?: CancellationToken
    ): Promise<model.CreateClusterResponse> {
        const path = "/api/2.0/clusters/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.CreateClusterResponse;
    }

    /**
     * create and wait to reach RUNNING state
     *  or fail on reaching ERROR state
     */
    async createAndWait(
        createCluster: model.CreateCluster,
        options?: {
            timeout?: Time;
            cancellationToken?: CancellationToken;
            onProgress?: (newPollResponse: model.ClusterInfo) => Promise<void>;
        }
    ): Promise<model.ClusterInfo> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        let {cancellationToken, timeout, onProgress} = options;

        const createClusterResponse = await this.create(createCluster);

        return await retry<model.ClusterInfo>({
            timeout,
            fn: async () => {
                const pollResponse = await this.get(
                    {
                        cluster_id: createClusterResponse.cluster_id!,
                    },
                    cancellationToken
                );
                if (cancellationToken?.isCancellationRequested) {
                    throw new ClustersError("createAndWait", "cancelled");
                }
                await onProgress(pollResponse);
                const status = pollResponse.state;
                const statusMessage = pollResponse.state_message;
                switch (status) {
                    case "RUNNING": {
                        return pollResponse;
                    }
                    case "ERROR": {
                        throw new ClustersError(
                            "createAndWait",
                            `failed to reach RUNNING state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new ClustersRetriableError(
                            "createAndWait",
                            `failed to reach RUNNING state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    /**
     * Terminate cluster
     *
     * Terminates the Spark cluster with the specified ID. The cluster is removed
     * asynchronously. Once the termination has completed, the cluster will be in
     * a ``TERMINATED`` state. If the cluster is already in a ``TERMINATING`` or
     * ``TERMINATED`` state, nothing will happen.
     */
    async delete(
        request: model.DeleteCluster,
        cancellationToken?: CancellationToken
    ): Promise<model.DeleteClusterResponse> {
        const path = "/api/2.0/clusters/delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.DeleteClusterResponse;
    }

    /**
     * delete and wait to reach TERMINATED state
     *  or fail on reaching ERROR state
     */
    async deleteAndWait(
        deleteCluster: model.DeleteCluster,
        options?: {
            timeout?: Time;
            cancellationToken?: CancellationToken;
            onProgress?: (newPollResponse: model.ClusterInfo) => Promise<void>;
        }
    ): Promise<model.ClusterInfo> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        let {cancellationToken, timeout, onProgress} = options;

        await this.delete(deleteCluster);

        return await retry<model.ClusterInfo>({
            timeout,
            fn: async () => {
                const pollResponse = await this.get(
                    {
                        cluster_id: deleteCluster.cluster_id!,
                    },
                    cancellationToken
                );
                if (cancellationToken?.isCancellationRequested) {
                    throw new ClustersError("deleteAndWait", "cancelled");
                }
                await onProgress(pollResponse);
                const status = pollResponse.state;
                const statusMessage = pollResponse.state_message;
                switch (status) {
                    case "TERMINATED": {
                        return pollResponse;
                    }
                    case "ERROR": {
                        throw new ClustersError(
                            "deleteAndWait",
                            `failed to reach TERMINATED state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new ClustersRetriableError(
                            "deleteAndWait",
                            `failed to reach TERMINATED state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    /**
     * Update cluster configuration
     *
     * Updates the configuration of a cluster to match the provided attributes
     * and size. A cluster can be updated if it is in a ``RUNNING`` or
     * ``TERMINATED`` state.
     *
     * If a cluster is updated while in a ``RUNNING`` state, it will be restarted
     * so that the new attributes can take effect.
     *
     * If a cluster is updated while in a ``TERMINATED`` state, it will remain
     * ``TERMINATED``. The next time it is started using the ``clusters/start``
     * API, the new attributes will take effect. Any attempt to update a cluster
     * in any other state will be rejected with an ``INVALID_STATE`` error code.
     *
     * Clusters created by the Databricks Jobs service cannot be edited.
     */
    async edit(
        request: model.EditCluster,
        cancellationToken?: CancellationToken
    ): Promise<model.EditClusterResponse> {
        const path = "/api/2.0/clusters/edit";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.EditClusterResponse;
    }

    /**
     * edit and wait to reach RUNNING state
     *  or fail on reaching ERROR state
     */
    async editAndWait(
        editCluster: model.EditCluster,
        options?: {
            timeout?: Time;
            cancellationToken?: CancellationToken;
            onProgress?: (newPollResponse: model.ClusterInfo) => Promise<void>;
        }
    ): Promise<model.ClusterInfo> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        let {cancellationToken, timeout, onProgress} = options;

        await this.edit(editCluster);

        return await retry<model.ClusterInfo>({
            timeout,
            fn: async () => {
                const pollResponse = await this.get(
                    {
                        cluster_id: editCluster.cluster_id!,
                    },
                    cancellationToken
                );
                if (cancellationToken?.isCancellationRequested) {
                    throw new ClustersError("editAndWait", "cancelled");
                }
                await onProgress(pollResponse);
                const status = pollResponse.state;
                const statusMessage = pollResponse.state_message;
                switch (status) {
                    case "RUNNING": {
                        return pollResponse;
                    }
                    case "ERROR": {
                        throw new ClustersError(
                            "editAndWait",
                            `failed to reach RUNNING state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new ClustersRetriableError(
                            "editAndWait",
                            `failed to reach RUNNING state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    /**
     * List cluster activity events
     *
     * Retrieves a list of events about the activity of a cluster. This API is
     * paginated. If there are more events to read, the response includes all the
     * nparameters necessary to request the next page of events.
     */
    async events(
        request: model.GetEvents,
        cancellationToken?: CancellationToken
    ): Promise<model.GetEventsResponse> {
        const path = "/api/2.0/clusters/events";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.GetEventsResponse;
    }

    /**
     * Get cluster info
     *
     * "Retrieves the information for a cluster given its identifier. Clusters
     * can be described while they are running, or up to 60 days after they are
     * terminated.
     */
    async get(
        request: model.GetRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.ClusterInfo> {
        const path = "/api/2.0/clusters/get";
        return (await this.client.request(
            path,
            "GET",
            request,
            cancellationToken
        )) as model.ClusterInfo;
    }

    /**
     * get and wait to reach RUNNING state
     *  or fail on reaching ERROR state
     */
    async getAndWait(
        getRequest: model.GetRequest,
        options?: {
            timeout?: Time;
            cancellationToken?: CancellationToken;
            onProgress?: (newPollResponse: model.ClusterInfo) => Promise<void>;
        }
    ): Promise<model.ClusterInfo> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        let {cancellationToken, timeout, onProgress} = options;

        const clusterInfo = await this.get(getRequest);

        return await retry<model.ClusterInfo>({
            timeout,
            fn: async () => {
                const pollResponse = await this.get(
                    {
                        cluster_id: clusterInfo.cluster_id!,
                    },
                    cancellationToken
                );
                if (cancellationToken?.isCancellationRequested) {
                    throw new ClustersError("getAndWait", "cancelled");
                }
                await onProgress(pollResponse);
                const status = pollResponse.state;
                const statusMessage = pollResponse.state_message;
                switch (status) {
                    case "RUNNING": {
                        return pollResponse;
                    }
                    case "ERROR": {
                        throw new ClustersError(
                            "getAndWait",
                            `failed to reach RUNNING state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new ClustersRetriableError(
                            "getAndWait",
                            `failed to reach RUNNING state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    /**
     * List all clusters
     *
     * Returns information about all pinned clusters, currently active clusters,
     * up to 70 of the most recently terminated interactive clusters in the past
     * 7 days, and up to 30 of the most recently terminated job clusters in the
     * past 7 days.
     *
     * For example, if there is 1 pinned cluster, 4 active clusters, 45
     * terminated interactive clusters in the past 7 days, and 50 terminated job
     * clusters\nin the past 7 days, then this API returns the 1 pinned cluster,
     * 4 active clusters, all 45 terminated interactive clusters, and the 30 most
     * recently terminated job clusters.
     */
    async list(
        request: model.ListRequest,
        cancellationToken?: CancellationToken
    ): Promise<model.ListClustersResponse> {
        const path = "/api/2.0/clusters/list";
        return (await this.client.request(
            path,
            "GET",
            request,
            cancellationToken
        )) as model.ListClustersResponse;
    }

    /**
     * List node types
     *
     * Returns a list of supported Spark node types. These node types can be used
     * to launch a cluster.
     */
    async listNodeTypes(
        cancellationToken?: CancellationToken
    ): Promise<model.ListNodeTypesResponse> {
        const path = "/api/2.0/clusters/list-node-types";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            cancellationToken
        )) as model.ListNodeTypesResponse;
    }

    /**
     * List availability zones
     *
     * Returns a list of availability zones where clusters can be created in (For
     * example, us-west-2a). These zones can be used to launch a cluster.
     */
    async listZones(
        cancellationToken?: CancellationToken
    ): Promise<model.ListAvailableZonesResponse> {
        const path = "/api/2.0/clusters/list-zones";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            cancellationToken
        )) as model.ListAvailableZonesResponse;
    }

    /**
     * Permanently delete cluster
     *
     * Permanently deletes a Spark cluster. This cluster is terminated and
     * resources are asynchronously removed.
     *
     * In addition, users will no longer see permanently deleted clusters in the
     * cluster list, and API users can no longer perform any action on
     * permanently deleted clusters.
     */
    async permanentDelete(
        request: model.PermanentDeleteCluster,
        cancellationToken?: CancellationToken
    ): Promise<model.PermanentDeleteClusterResponse> {
        const path = "/api/2.0/clusters/permanent-delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.PermanentDeleteClusterResponse;
    }

    /**
     * Pin cluster
     *
     * Pinning a cluster ensures that the cluster will always be returned by the
     * ListClusters API. Pinning a cluster that is already pinned will have no
     * effect. This API can only be called by workspace admins.
     */
    async pin(
        request: model.PinCluster,
        cancellationToken?: CancellationToken
    ): Promise<model.PinClusterResponse> {
        const path = "/api/2.0/clusters/pin";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.PinClusterResponse;
    }

    /**
     * Resize cluster
     *
     * Resizes a cluster to have a desired number of workers. This will fail
     * unless the cluster is in a `RUNNING` state.
     */
    async resize(
        request: model.ResizeCluster,
        cancellationToken?: CancellationToken
    ): Promise<model.ResizeClusterResponse> {
        const path = "/api/2.0/clusters/resize";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.ResizeClusterResponse;
    }

    /**
     * resize and wait to reach RUNNING state
     *  or fail on reaching ERROR state
     */
    async resizeAndWait(
        resizeCluster: model.ResizeCluster,
        options?: {
            timeout?: Time;
            cancellationToken?: CancellationToken;
            onProgress?: (newPollResponse: model.ClusterInfo) => Promise<void>;
        }
    ): Promise<model.ClusterInfo> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        let {cancellationToken, timeout, onProgress} = options;

        await this.resize(resizeCluster);

        return await retry<model.ClusterInfo>({
            timeout,
            fn: async () => {
                const pollResponse = await this.get(
                    {
                        cluster_id: resizeCluster.cluster_id!,
                    },
                    cancellationToken
                );
                if (cancellationToken?.isCancellationRequested) {
                    throw new ClustersError("resizeAndWait", "cancelled");
                }
                await onProgress(pollResponse);
                const status = pollResponse.state;
                const statusMessage = pollResponse.state_message;
                switch (status) {
                    case "RUNNING": {
                        return pollResponse;
                    }
                    case "ERROR": {
                        throw new ClustersError(
                            "resizeAndWait",
                            `failed to reach RUNNING state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new ClustersRetriableError(
                            "resizeAndWait",
                            `failed to reach RUNNING state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    /**
     * Restart cluster
     *
     * Restarts a Spark cluster with the supplied ID. If the cluster is not
     * currently in a `RUNNING` state, nothing will happen.
     */
    async restart(
        request: model.RestartCluster,
        cancellationToken?: CancellationToken
    ): Promise<model.RestartClusterResponse> {
        const path = "/api/2.0/clusters/restart";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.RestartClusterResponse;
    }

    /**
     * restart and wait to reach RUNNING state
     *  or fail on reaching ERROR state
     */
    async restartAndWait(
        restartCluster: model.RestartCluster,
        options?: {
            timeout?: Time;
            cancellationToken?: CancellationToken;
            onProgress?: (newPollResponse: model.ClusterInfo) => Promise<void>;
        }
    ): Promise<model.ClusterInfo> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        let {cancellationToken, timeout, onProgress} = options;

        await this.restart(restartCluster);

        return await retry<model.ClusterInfo>({
            timeout,
            fn: async () => {
                const pollResponse = await this.get(
                    {
                        cluster_id: restartCluster.cluster_id!,
                    },
                    cancellationToken
                );
                if (cancellationToken?.isCancellationRequested) {
                    throw new ClustersError("restartAndWait", "cancelled");
                }
                await onProgress(pollResponse);
                const status = pollResponse.state;
                const statusMessage = pollResponse.state_message;
                switch (status) {
                    case "RUNNING": {
                        return pollResponse;
                    }
                    case "ERROR": {
                        throw new ClustersError(
                            "restartAndWait",
                            `failed to reach RUNNING state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new ClustersRetriableError(
                            "restartAndWait",
                            `failed to reach RUNNING state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    /**
     * List available Spark versions
     *
     * Returns the list of available Spark versions. These versions can be used
     * to launch a cluster.
     */
    async sparkVersions(
        cancellationToken?: CancellationToken
    ): Promise<model.GetSparkVersionsResponse> {
        const path = "/api/2.0/clusters/spark-versions";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            cancellationToken
        )) as model.GetSparkVersionsResponse;
    }

    /**
     * Start terminated cluster
     *
     * Starts a terminated Spark cluster with the supplied ID. This works similar
     * to `createCluster` except:
     *
     * * The previous cluster id and attributes are preserved. * The cluster
     * starts with the last specified cluster size. * If the previous cluster was
     * an autoscaling cluster, the current cluster starts with the minimum number
     * of nodes. * If the cluster is not currently in a ``TERMINATED`` state,
     * nothing will happen. * Clusters launched to run a job cannot be started.
     */
    async start(
        request: model.StartCluster,
        cancellationToken?: CancellationToken
    ): Promise<model.StartClusterResponse> {
        const path = "/api/2.0/clusters/start";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.StartClusterResponse;
    }

    /**
     * start and wait to reach RUNNING state
     *  or fail on reaching ERROR state
     */
    async startAndWait(
        startCluster: model.StartCluster,
        options?: {
            timeout?: Time;
            cancellationToken?: CancellationToken;
            onProgress?: (newPollResponse: model.ClusterInfo) => Promise<void>;
        }
    ): Promise<model.ClusterInfo> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        let {cancellationToken, timeout, onProgress} = options;

        await this.start(startCluster);

        return await retry<model.ClusterInfo>({
            timeout,
            fn: async () => {
                const pollResponse = await this.get(
                    {
                        cluster_id: startCluster.cluster_id!,
                    },
                    cancellationToken
                );
                if (cancellationToken?.isCancellationRequested) {
                    throw new ClustersError("startAndWait", "cancelled");
                }
                await onProgress(pollResponse);
                const status = pollResponse.state;
                const statusMessage = pollResponse.state_message;
                switch (status) {
                    case "RUNNING": {
                        return pollResponse;
                    }
                    case "ERROR": {
                        throw new ClustersError(
                            "startAndWait",
                            `failed to reach RUNNING state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new ClustersRetriableError(
                            "startAndWait",
                            `failed to reach RUNNING state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    /**
     * Unpin cluster
     *
     * Unpinning a cluster will allow the cluster to eventually be removed from
     * the ListClusters API. Unpinning a cluster that is not pinned will have no
     * effect. This API can only be called by workspace admins.
     */
    async unpin(
        request: model.UnpinCluster,
        cancellationToken?: CancellationToken
    ): Promise<model.UnpinClusterResponse> {
        const path = "/api/2.0/clusters/unpin";
        return (await this.client.request(
            path,
            "POST",
            request,
            cancellationToken
        )) as model.UnpinClusterResponse;
    }
}
