/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

import {ApiClient} from "../../api-client";
import * as model from "./model";
import Time from "../../retries/Time";
import retry from "../../retries/retries";
import {CancellationToken} from "../../types";
import {ApiError, ApiRetriableError} from "../apiError";
import {context, Context} from "../../context";
import {ExposedLoggers, withLogContext} from "../../logging";

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
    @withLogContext(ExposedLoggers.SDK)
    async changeOwner(
        request: model.ChangeClusterOwner,
        @context context?: Context
    ): Promise<model.ChangeClusterOwnerResponse> {
        const path = "/api/2.0/clusters/change-owner";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
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
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateCluster,
        @context context?: Context
    ): Promise<model.CreateClusterResponse> {
        const path = "/api/2.0/clusters/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreateClusterResponse;
    }

    /**
     * create and wait to reach RUNNING state
     *  or fail on reaching ERROR state
     */
    @withLogContext(ExposedLoggers.SDK)
    async createAndWait(
        createCluster: model.CreateCluster,
        options?: {
            timeout?: Time;
            onProgress?: (newPollResponse: model.ClusterInfo) => Promise<void>;
        },
        @context context?: Context
    ): Promise<model.ClusterInfo> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        let {timeout, onProgress} = options;
        let cancellationToken = context?.cancellationToken;

        const createClusterResponse = await this.create(createCluster, context);

        return await retry<model.ClusterInfo>({
            timeout,
            fn: async () => {
                const pollResponse = await this.get(
                    {
                        cluster_id: createClusterResponse.cluster_id!,
                    },
                    context
                );
                if (cancellationToken?.isCancellationRequested) {
                    context?.logger?.error("Clusters.createAndWait: cancelled");
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
                        const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `Clusters.createAndWait: ${errorMessage}`
                        );
                        throw new ClustersError("createAndWait", errorMessage);
                    }
                    default: {
                        const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `Clusters.createAndWait: retrying: ${errorMessage}`
                        );
                        throw new ClustersRetriableError(
                            "createAndWait",
                            errorMessage
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
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteCluster,
        @context context?: Context
    ): Promise<model.DeleteClusterResponse> {
        const path = "/api/2.0/clusters/delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.DeleteClusterResponse;
    }

    /**
     * delete and wait to reach TERMINATED state
     *  or fail on reaching ERROR state
     */
    @withLogContext(ExposedLoggers.SDK)
    async deleteAndWait(
        deleteCluster: model.DeleteCluster,
        options?: {
            timeout?: Time;
            onProgress?: (newPollResponse: model.ClusterInfo) => Promise<void>;
        },
        @context context?: Context
    ): Promise<model.ClusterInfo> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        let {timeout, onProgress} = options;
        let cancellationToken = context?.cancellationToken;

        await this.delete(deleteCluster, context);

        return await retry<model.ClusterInfo>({
            timeout,
            fn: async () => {
                const pollResponse = await this.get(
                    {
                        cluster_id: deleteCluster.cluster_id!,
                    },
                    context
                );
                if (cancellationToken?.isCancellationRequested) {
                    context?.logger?.error("Clusters.deleteAndWait: cancelled");
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
                        const errorMessage = `failed to reach TERMINATED state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `Clusters.deleteAndWait: ${errorMessage}`
                        );
                        throw new ClustersError("deleteAndWait", errorMessage);
                    }
                    default: {
                        const errorMessage = `failed to reach TERMINATED state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `Clusters.deleteAndWait: retrying: ${errorMessage}`
                        );
                        throw new ClustersRetriableError(
                            "deleteAndWait",
                            errorMessage
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
    @withLogContext(ExposedLoggers.SDK)
    async edit(
        request: model.EditCluster,
        @context context?: Context
    ): Promise<model.EditClusterResponse> {
        const path = "/api/2.0/clusters/edit";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EditClusterResponse;
    }

    /**
     * edit and wait to reach RUNNING state
     *  or fail on reaching ERROR state
     */
    @withLogContext(ExposedLoggers.SDK)
    async editAndWait(
        editCluster: model.EditCluster,
        options?: {
            timeout?: Time;
            onProgress?: (newPollResponse: model.ClusterInfo) => Promise<void>;
        },
        @context context?: Context
    ): Promise<model.ClusterInfo> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        let {timeout, onProgress} = options;
        let cancellationToken = context?.cancellationToken;

        await this.edit(editCluster, context);

        return await retry<model.ClusterInfo>({
            timeout,
            fn: async () => {
                const pollResponse = await this.get(
                    {
                        cluster_id: editCluster.cluster_id!,
                    },
                    context
                );
                if (cancellationToken?.isCancellationRequested) {
                    context?.logger?.error("Clusters.editAndWait: cancelled");
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
                        const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `Clusters.editAndWait: ${errorMessage}`
                        );
                        throw new ClustersError("editAndWait", errorMessage);
                    }
                    default: {
                        const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `Clusters.editAndWait: retrying: ${errorMessage}`
                        );
                        throw new ClustersRetriableError(
                            "editAndWait",
                            errorMessage
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
    @withLogContext(ExposedLoggers.SDK)
    async events(
        request: model.GetEvents,
        @context context?: Context
    ): Promise<model.GetEventsResponse> {
        const path = "/api/2.0/clusters/events";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.GetEventsResponse;
    }

    /**
     * Get cluster info
     *
     * "Retrieves the information for a cluster given its identifier. Clusters
     * can be described while they are running, or up to 60 days after they are
     * terminated.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetRequest,
        @context context?: Context
    ): Promise<model.ClusterInfo> {
        const path = "/api/2.0/clusters/get";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ClusterInfo;
    }

    /**
     * get and wait to reach RUNNING state
     *  or fail on reaching ERROR state
     */
    @withLogContext(ExposedLoggers.SDK)
    async getAndWait(
        getRequest: model.GetRequest,
        options?: {
            timeout?: Time;
            onProgress?: (newPollResponse: model.ClusterInfo) => Promise<void>;
        },
        @context context?: Context
    ): Promise<model.ClusterInfo> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        let {timeout, onProgress} = options;
        let cancellationToken = context?.cancellationToken;

        const clusterInfo = await this.get(getRequest, context);

        return await retry<model.ClusterInfo>({
            timeout,
            fn: async () => {
                const pollResponse = await this.get(
                    {
                        cluster_id: clusterInfo.cluster_id!,
                    },
                    context
                );
                if (cancellationToken?.isCancellationRequested) {
                    context?.logger?.error("Clusters.getAndWait: cancelled");
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
                        const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `Clusters.getAndWait: ${errorMessage}`
                        );
                        throw new ClustersError("getAndWait", errorMessage);
                    }
                    default: {
                        const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `Clusters.getAndWait: retrying: ${errorMessage}`
                        );
                        throw new ClustersRetriableError(
                            "getAndWait",
                            errorMessage
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
    @withLogContext(ExposedLoggers.SDK)
    async list(
        request: model.ListRequest,
        @context context?: Context
    ): Promise<model.ListClustersResponse> {
        const path = "/api/2.0/clusters/list";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListClustersResponse;
    }

    /**
     * List node types
     *
     * Returns a list of supported Spark node types. These node types can be used
     * to launch a cluster.
     */
    @withLogContext(ExposedLoggers.SDK)
    async listNodeTypes(
        @context context?: Context
    ): Promise<model.ListNodeTypesResponse> {
        const path = "/api/2.0/clusters/list-node-types";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.ListNodeTypesResponse;
    }

    /**
     * List availability zones
     *
     * Returns a list of availability zones where clusters can be created in (For
     * example, us-west-2a). These zones can be used to launch a cluster.
     */
    @withLogContext(ExposedLoggers.SDK)
    async listZones(
        @context context?: Context
    ): Promise<model.ListAvailableZonesResponse> {
        const path = "/api/2.0/clusters/list-zones";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
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
    @withLogContext(ExposedLoggers.SDK)
    async permanentDelete(
        request: model.PermanentDeleteCluster,
        @context context?: Context
    ): Promise<model.PermanentDeleteClusterResponse> {
        const path = "/api/2.0/clusters/permanent-delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.PermanentDeleteClusterResponse;
    }

    /**
     * Pin cluster
     *
     * Pinning a cluster ensures that the cluster will always be returned by the
     * ListClusters API. Pinning a cluster that is already pinned will have no
     * effect. This API can only be called by workspace admins.
     */
    @withLogContext(ExposedLoggers.SDK)
    async pin(
        request: model.PinCluster,
        @context context?: Context
    ): Promise<model.PinClusterResponse> {
        const path = "/api/2.0/clusters/pin";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.PinClusterResponse;
    }

    /**
     * Resize cluster
     *
     * Resizes a cluster to have a desired number of workers. This will fail
     * unless the cluster is in a `RUNNING` state.
     */
    @withLogContext(ExposedLoggers.SDK)
    async resize(
        request: model.ResizeCluster,
        @context context?: Context
    ): Promise<model.ResizeClusterResponse> {
        const path = "/api/2.0/clusters/resize";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.ResizeClusterResponse;
    }

    /**
     * resize and wait to reach RUNNING state
     *  or fail on reaching ERROR state
     */
    @withLogContext(ExposedLoggers.SDK)
    async resizeAndWait(
        resizeCluster: model.ResizeCluster,
        options?: {
            timeout?: Time;
            onProgress?: (newPollResponse: model.ClusterInfo) => Promise<void>;
        },
        @context context?: Context
    ): Promise<model.ClusterInfo> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        let {timeout, onProgress} = options;
        let cancellationToken = context?.cancellationToken;

        await this.resize(resizeCluster, context);

        return await retry<model.ClusterInfo>({
            timeout,
            fn: async () => {
                const pollResponse = await this.get(
                    {
                        cluster_id: resizeCluster.cluster_id!,
                    },
                    context
                );
                if (cancellationToken?.isCancellationRequested) {
                    context?.logger?.error("Clusters.resizeAndWait: cancelled");
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
                        const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `Clusters.resizeAndWait: ${errorMessage}`
                        );
                        throw new ClustersError("resizeAndWait", errorMessage);
                    }
                    default: {
                        const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `Clusters.resizeAndWait: retrying: ${errorMessage}`
                        );
                        throw new ClustersRetriableError(
                            "resizeAndWait",
                            errorMessage
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
    @withLogContext(ExposedLoggers.SDK)
    async restart(
        request: model.RestartCluster,
        @context context?: Context
    ): Promise<model.RestartClusterResponse> {
        const path = "/api/2.0/clusters/restart";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.RestartClusterResponse;
    }

    /**
     * restart and wait to reach RUNNING state
     *  or fail on reaching ERROR state
     */
    @withLogContext(ExposedLoggers.SDK)
    async restartAndWait(
        restartCluster: model.RestartCluster,
        options?: {
            timeout?: Time;
            onProgress?: (newPollResponse: model.ClusterInfo) => Promise<void>;
        },
        @context context?: Context
    ): Promise<model.ClusterInfo> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        let {timeout, onProgress} = options;
        let cancellationToken = context?.cancellationToken;

        await this.restart(restartCluster, context);

        return await retry<model.ClusterInfo>({
            timeout,
            fn: async () => {
                const pollResponse = await this.get(
                    {
                        cluster_id: restartCluster.cluster_id!,
                    },
                    context
                );
                if (cancellationToken?.isCancellationRequested) {
                    context?.logger?.error(
                        "Clusters.restartAndWait: cancelled"
                    );
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
                        const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `Clusters.restartAndWait: ${errorMessage}`
                        );
                        throw new ClustersError("restartAndWait", errorMessage);
                    }
                    default: {
                        const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `Clusters.restartAndWait: retrying: ${errorMessage}`
                        );
                        throw new ClustersRetriableError(
                            "restartAndWait",
                            errorMessage
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
    @withLogContext(ExposedLoggers.SDK)
    async sparkVersions(
        @context context?: Context
    ): Promise<model.GetSparkVersionsResponse> {
        const path = "/api/2.0/clusters/spark-versions";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
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
    @withLogContext(ExposedLoggers.SDK)
    async start(
        request: model.StartCluster,
        @context context?: Context
    ): Promise<model.StartClusterResponse> {
        const path = "/api/2.0/clusters/start";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.StartClusterResponse;
    }

    /**
     * start and wait to reach RUNNING state
     *  or fail on reaching ERROR state
     */
    @withLogContext(ExposedLoggers.SDK)
    async startAndWait(
        startCluster: model.StartCluster,
        options?: {
            timeout?: Time;
            onProgress?: (newPollResponse: model.ClusterInfo) => Promise<void>;
        },
        @context context?: Context
    ): Promise<model.ClusterInfo> {
        options = options || {};
        options.onProgress =
            options.onProgress || (async (newPollResponse) => {});
        let {timeout, onProgress} = options;
        let cancellationToken = context?.cancellationToken;

        await this.start(startCluster, context);

        return await retry<model.ClusterInfo>({
            timeout,
            fn: async () => {
                const pollResponse = await this.get(
                    {
                        cluster_id: startCluster.cluster_id!,
                    },
                    context
                );
                if (cancellationToken?.isCancellationRequested) {
                    context?.logger?.error("Clusters.startAndWait: cancelled");
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
                        const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `Clusters.startAndWait: ${errorMessage}`
                        );
                        throw new ClustersError("startAndWait", errorMessage);
                    }
                    default: {
                        const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                        context?.logger?.error(
                            `Clusters.startAndWait: retrying: ${errorMessage}`
                        );
                        throw new ClustersRetriableError(
                            "startAndWait",
                            errorMessage
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
    @withLogContext(ExposedLoggers.SDK)
    async unpin(
        request: model.UnpinCluster,
        @context context?: Context
    ): Promise<model.UnpinClusterResponse> {
        const path = "/api/2.0/clusters/unpin";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.UnpinClusterResponse;
    }
}
