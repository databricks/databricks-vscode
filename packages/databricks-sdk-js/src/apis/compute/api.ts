/* eslint-disable @typescript-eslint/naming-convention */
// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

/**
 * These APIs allow you to manage Cluster Policies, Clusters, Command Execution, Global Init Scripts, Instance Pools, Instance Profiles, Libraries, Policy Families, etc.
 */

import {ApiClient} from "../../api-client";
import * as model from "./model";
import Time from "../../retries/Time";
import retry from "../../retries/retries";
import {CancellationToken} from "../../types";
import {ApiError, ApiRetriableError} from "../apiError";
import {context, Context} from "../../context";
import {ExposedLoggers, withLogContext} from "../../logging";
import {Waiter, asWaiter} from "../../wait";

export class ClusterPoliciesRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("ClusterPolicies", method, message);
    }
}
export class ClusterPoliciesError extends ApiError {
    constructor(method: string, message?: string) {
        super("ClusterPolicies", method, message);
    }
}

/**
 * Cluster policy limits the ability to configure clusters based on a set of
 * rules. The policy rules limit the attributes or attribute values available for
 * cluster creation. Cluster policies have ACLs that limit their use to specific
 * users and groups.
 *
 * Cluster policies let you limit users to create clusters with prescribed
 * settings, simplify the user interface and enable more users to create their
 * own clusters (by fixing and hiding some values), control cost by limiting per
 * cluster maximum cost (by setting limits on attributes whose values contribute
 * to hourly price).
 *
 * Cluster policy permissions limit which policies a user can select in the
 * Policy drop-down when the user creates a cluster: - A user who has cluster
 * create permission can select the Unrestricted policy and create
 * fully-configurable clusters. - A user who has both cluster create permission
 * and access to cluster policies can select the Unrestricted policy and policies
 * they have access to. - A user that has access to only cluster policies, can
 * select the policies they have access to.
 *
 * If no policies have been created in the workspace, the Policy drop-down does
 * not display.
 *
 * Only admin users can create, edit, and delete policies. Admin users also have
 * access to all policies.
 */
export class ClusterPoliciesService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.CreatePolicy,
        @context context?: Context
    ): Promise<model.CreatePolicyResponse> {
        const path = "/api/2.0/policies/clusters/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreatePolicyResponse;
    }

    /**
     * Create a new policy.
     *
     * Creates a new policy with prescribed settings.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreatePolicy,
        @context context?: Context
    ): Promise<model.CreatePolicyResponse> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeletePolicy,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/policies/clusters/delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete a cluster policy.
     *
     * Delete a policy for a cluster. Clusters governed by this policy can still
     * run, but cannot be edited.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeletePolicy,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _edit(
        request: model.EditPolicy,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/policies/clusters/edit";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Update a cluster policy.
     *
     * Update an existing policy for cluster. This operation may make some
     * clusters governed by the previous policy invalid.
     */
    @withLogContext(ExposedLoggers.SDK)
    async edit(
        request: model.EditPolicy,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._edit(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetClusterPolicyRequest,
        @context context?: Context
    ): Promise<model.Policy> {
        const path = "/api/2.0/policies/clusters/get";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.Policy;
    }

    /**
     * Get entity.
     *
     * Get a cluster policy entity. Creation and editing is available to admins
     * only.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetClusterPolicyRequest,
        @context context?: Context
    ): Promise<model.Policy> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: model.ListClusterPoliciesRequest,
        @context context?: Context
    ): Promise<model.ListPoliciesResponse> {
        const path = "/api/2.0/policies/clusters/list";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListPoliciesResponse;
    }

    /**
     * Get a cluster policy.
     *
     * Returns a list of policies accessible by the requesting user.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        request: model.ListClusterPoliciesRequest,
        @context context?: Context
    ): AsyncIterable<model.Policy> {
        const response = (await this._list(request, context)).policies;
        for (const v of response || []) {
            yield v;
        }
    }
}

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
 * The Clusters API allows you to create, start, edit, list, terminate, and
 * delete clusters.
 *
 * Databricks maps cluster node instance types to compute units known as DBUs.
 * See the instance type pricing page for a list of the supported instance types
 * and their corresponding DBUs.
 *
 * A Databricks cluster is a set of computation resources and configurations on
 * which you run data engineering, data science, and data analytics workloads,
 * such as production ETL pipelines, streaming analytics, ad-hoc analytics, and
 * machine learning.
 *
 * You run these workloads as a set of commands in a notebook or as an automated
 * job. Databricks makes a distinction between all-purpose clusters and job
 * clusters. You use all-purpose clusters to analyze data collaboratively using
 * interactive notebooks. You use job clusters to run fast and robust automated
 * jobs.
 *
 * You can create an all-purpose cluster using the UI, CLI, or REST API. You can
 * manually terminate and restart an all-purpose cluster. Multiple users can
 * share such clusters to do collaborative interactive analysis.
 *
 * IMPORTANT: Databricks retains cluster configuration information for up to 200
 * all-purpose clusters terminated in the last 30 days and up to 30 job clusters
 * recently terminated by the job scheduler. To keep an all-purpose cluster
 * configuration even after it has been terminated for more than 30 days, an
 * administrator can pin a cluster to the cluster list.
 */
export class ClustersService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _changeOwner(
        request: model.ChangeClusterOwner,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/clusters/change-owner";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Change cluster owner.
     *
     * Change the owner of the cluster. You must be an admin to perform this
     * operation.
     */
    @withLogContext(ExposedLoggers.SDK)
    async changeOwner(
        request: model.ChangeClusterOwner,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._changeOwner(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
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
     * Create new cluster.
     *
     * Creates a new Spark cluster. This method will acquire new instances from
     * the cloud provider if necessary. Note: Databricks may not be able to
     * acquire some of the requested nodes, due to cloud provider limitations
     * (account limits, spot price, etc.) or transient network issues.
     *
     * If Databricks acquires at least 85% of the requested on-demand nodes,
     * cluster creation will succeed. Otherwise the cluster will terminate with
     * an informative error message.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        createCluster: model.CreateCluster,
        @context context?: Context
    ): Promise<Waiter<model.CreateClusterResponse, model.ClusterDetails>> {
        const cancellationToken = context?.cancellationToken;

        const createClusterResponse = await this._create(
            createCluster,
            context
        );

        return asWaiter(createClusterResponse, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

            return await retry<model.ClusterDetails>({
                timeout,
                fn: async () => {
                    const pollResponse = await this.get(
                        {
                            cluster_id: createClusterResponse.cluster_id!,
                        },
                        context
                    );
                    if (cancellationToken?.isCancellationRequested) {
                        context?.logger?.error(
                            "Clusters.createAndWait: cancelled"
                        );
                        throw new ClustersError("createAndWait", "cancelled");
                    }
                    await onProgress(pollResponse);
                    const status = pollResponse.state;
                    const statusMessage = pollResponse.state_message;
                    switch (status) {
                        case "RUNNING": {
                            return pollResponse;
                        }
                        case "ERROR":
                        case "TERMINATED": {
                            const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `Clusters.createAndWait: ${errorMessage}`
                            );
                            throw new ClustersError(
                                "createAndWait",
                                errorMessage
                            );
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
        });
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteCluster,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/clusters/delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Terminate cluster.
     *
     * Terminates the Spark cluster with the specified ID. The cluster is removed
     * asynchronously. Once the termination has completed, the cluster will be in
     * a `TERMINATED` state. If the cluster is already in a `TERMINATING` or
     * `TERMINATED` state, nothing will happen.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        deleteCluster: model.DeleteCluster,
        @context context?: Context
    ): Promise<Waiter<model.EmptyResponse, model.ClusterDetails>> {
        const cancellationToken = context?.cancellationToken;

        await this._delete(deleteCluster, context);

        return asWaiter(null, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

            return await retry<model.ClusterDetails>({
                timeout,
                fn: async () => {
                    const pollResponse = await this.get(
                        {
                            cluster_id: deleteCluster.cluster_id!,
                        },
                        context
                    );
                    if (cancellationToken?.isCancellationRequested) {
                        context?.logger?.error(
                            "Clusters.deleteAndWait: cancelled"
                        );
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
                            throw new ClustersError(
                                "deleteAndWait",
                                errorMessage
                            );
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
        });
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _edit(
        request: model.EditCluster,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/clusters/edit";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Update cluster configuration.
     *
     * Updates the configuration of a cluster to match the provided attributes
     * and size. A cluster can be updated if it is in a `RUNNING` or `TERMINATED`
     * state.
     *
     * If a cluster is updated while in a `RUNNING` state, it will be restarted
     * so that the new attributes can take effect.
     *
     * If a cluster is updated while in a `TERMINATED` state, it will remain
     * `TERMINATED`. The next time it is started using the `clusters/start` API,
     * the new attributes will take effect. Any attempt to update a cluster in
     * any other state will be rejected with an `INVALID_STATE` error code.
     *
     * Clusters created by the Databricks Jobs service cannot be edited.
     */
    @withLogContext(ExposedLoggers.SDK)
    async edit(
        editCluster: model.EditCluster,
        @context context?: Context
    ): Promise<Waiter<model.EmptyResponse, model.ClusterDetails>> {
        const cancellationToken = context?.cancellationToken;

        await this._edit(editCluster, context);

        return asWaiter(null, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

            return await retry<model.ClusterDetails>({
                timeout,
                fn: async () => {
                    const pollResponse = await this.get(
                        {
                            cluster_id: editCluster.cluster_id!,
                        },
                        context
                    );
                    if (cancellationToken?.isCancellationRequested) {
                        context?.logger?.error(
                            "Clusters.editAndWait: cancelled"
                        );
                        throw new ClustersError("editAndWait", "cancelled");
                    }
                    await onProgress(pollResponse);
                    const status = pollResponse.state;
                    const statusMessage = pollResponse.state_message;
                    switch (status) {
                        case "RUNNING": {
                            return pollResponse;
                        }
                        case "ERROR":
                        case "TERMINATED": {
                            const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `Clusters.editAndWait: ${errorMessage}`
                            );
                            throw new ClustersError(
                                "editAndWait",
                                errorMessage
                            );
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
        });
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _events(
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
     * List cluster activity events.
     *
     * Retrieves a list of events about the activity of a cluster. This API is
     * paginated. If there are more events to read, the response includes all the
     * nparameters necessary to request the next page of events.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *events(
        request: model.GetEvents,
        @context context?: Context
    ): AsyncIterable<model.ClusterEvent> {
        while (true) {
            const response = await this._events(request, context);
            if (
                context?.cancellationToken &&
                context?.cancellationToken.isCancellationRequested
            ) {
                break;
            }

            if (!response.events || response.events.length === 0) {
                break;
            }

            for (const v of response.events) {
                yield v;
            }

            if (!response.next_page) {
                break;
            }
            request = response.next_page;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetClusterRequest,
        @context context?: Context
    ): Promise<model.ClusterDetails> {
        const path = "/api/2.0/clusters/get";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ClusterDetails;
    }

    /**
     * Get cluster info.
     *
     * Retrieves the information for a cluster given its identifier. Clusters can
     * be described while they are running, or up to 60 days after they are
     * terminated.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        getClusterRequest: model.GetClusterRequest,
        @context context?: Context
    ): Promise<Waiter<model.ClusterDetails, model.ClusterDetails>> {
        const cancellationToken = context?.cancellationToken;

        const clusterDetails = await this._get(getClusterRequest, context);

        return asWaiter(clusterDetails, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

            return await retry<model.ClusterDetails>({
                timeout,
                fn: async () => {
                    const pollResponse = await this.get(
                        {
                            cluster_id: clusterDetails.cluster_id!,
                        },
                        context
                    );
                    if (cancellationToken?.isCancellationRequested) {
                        context?.logger?.error(
                            "Clusters.getAndWait: cancelled"
                        );
                        throw new ClustersError("getAndWait", "cancelled");
                    }
                    await onProgress(pollResponse);
                    const status = pollResponse.state;
                    const statusMessage = pollResponse.state_message;
                    switch (status) {
                        case "RUNNING": {
                            return pollResponse;
                        }
                        case "ERROR":
                        case "TERMINATED": {
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
        });
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: model.ListClustersRequest,
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
     * List all clusters.
     *
     * Return information about all pinned clusters, active clusters, up to 200
     * of the most recently terminated all-purpose clusters in the past 30 days,
     * and up to 30 of the most recently terminated job clusters in the past 30
     * days.
     *
     * For example, if there is 1 pinned cluster, 4 active clusters, 45
     * terminated all-purpose clusters in the past 30 days, and 50 terminated job
     * clusters in the past 30 days, then this API returns the 1 pinned cluster,
     * 4 active clusters, all 45 terminated all-purpose clusters, and the 30 most
     * recently terminated job clusters.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        request: model.ListClustersRequest,
        @context context?: Context
    ): AsyncIterable<model.ClusterDetails> {
        const response = (await this._list(request, context)).clusters;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _listNodeTypes(
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
     * List node types.
     *
     * Returns a list of supported Spark node types. These node types can be used
     * to launch a cluster.
     */
    @withLogContext(ExposedLoggers.SDK)
    async listNodeTypes(
        @context context?: Context
    ): Promise<model.ListNodeTypesResponse> {
        return await this._listNodeTypes(context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _listZones(
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
     * List availability zones.
     *
     * Returns a list of availability zones where clusters can be created in (For
     * example, us-west-2a). These zones can be used to launch a cluster.
     */
    @withLogContext(ExposedLoggers.SDK)
    async listZones(
        @context context?: Context
    ): Promise<model.ListAvailableZonesResponse> {
        return await this._listZones(context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _permanentDelete(
        request: model.PermanentDeleteCluster,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/clusters/permanent-delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Permanently delete cluster.
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
    ): Promise<model.EmptyResponse> {
        return await this._permanentDelete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _pin(
        request: model.PinCluster,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/clusters/pin";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Pin cluster.
     *
     * Pinning a cluster ensures that the cluster will always be returned by the
     * ListClusters API. Pinning a cluster that is already pinned will have no
     * effect. This API can only be called by workspace admins.
     */
    @withLogContext(ExposedLoggers.SDK)
    async pin(
        request: model.PinCluster,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._pin(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _resize(
        request: model.ResizeCluster,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/clusters/resize";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Resize cluster.
     *
     * Resizes a cluster to have a desired number of workers. This will fail
     * unless the cluster is in a `RUNNING` state.
     */
    @withLogContext(ExposedLoggers.SDK)
    async resize(
        resizeCluster: model.ResizeCluster,
        @context context?: Context
    ): Promise<Waiter<model.EmptyResponse, model.ClusterDetails>> {
        const cancellationToken = context?.cancellationToken;

        await this._resize(resizeCluster, context);

        return asWaiter(null, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

            return await retry<model.ClusterDetails>({
                timeout,
                fn: async () => {
                    const pollResponse = await this.get(
                        {
                            cluster_id: resizeCluster.cluster_id!,
                        },
                        context
                    );
                    if (cancellationToken?.isCancellationRequested) {
                        context?.logger?.error(
                            "Clusters.resizeAndWait: cancelled"
                        );
                        throw new ClustersError("resizeAndWait", "cancelled");
                    }
                    await onProgress(pollResponse);
                    const status = pollResponse.state;
                    const statusMessage = pollResponse.state_message;
                    switch (status) {
                        case "RUNNING": {
                            return pollResponse;
                        }
                        case "ERROR":
                        case "TERMINATED": {
                            const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `Clusters.resizeAndWait: ${errorMessage}`
                            );
                            throw new ClustersError(
                                "resizeAndWait",
                                errorMessage
                            );
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
        });
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _restart(
        request: model.RestartCluster,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/clusters/restart";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Restart cluster.
     *
     * Restarts a Spark cluster with the supplied ID. If the cluster is not
     * currently in a `RUNNING` state, nothing will happen.
     */
    @withLogContext(ExposedLoggers.SDK)
    async restart(
        restartCluster: model.RestartCluster,
        @context context?: Context
    ): Promise<Waiter<model.EmptyResponse, model.ClusterDetails>> {
        const cancellationToken = context?.cancellationToken;

        await this._restart(restartCluster, context);

        return asWaiter(null, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

            return await retry<model.ClusterDetails>({
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
                        case "ERROR":
                        case "TERMINATED": {
                            const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `Clusters.restartAndWait: ${errorMessage}`
                            );
                            throw new ClustersError(
                                "restartAndWait",
                                errorMessage
                            );
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
        });
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _sparkVersions(
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
     * List available Spark versions.
     *
     * Returns the list of available Spark versions. These versions can be used
     * to launch a cluster.
     */
    @withLogContext(ExposedLoggers.SDK)
    async sparkVersions(
        @context context?: Context
    ): Promise<model.GetSparkVersionsResponse> {
        return await this._sparkVersions(context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _start(
        request: model.StartCluster,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/clusters/start";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Start terminated cluster.
     *
     * Starts a terminated Spark cluster with the supplied ID. This works similar
     * to `createCluster` except:
     *
     * * The previous cluster id and attributes are preserved. * The cluster
     * starts with the last specified cluster size. * If the previous cluster was
     * an autoscaling cluster, the current cluster starts with the minimum number
     * of nodes. * If the cluster is not currently in a `TERMINATED` state,
     * nothing will happen. * Clusters launched to run a job cannot be started.
     */
    @withLogContext(ExposedLoggers.SDK)
    async start(
        startCluster: model.StartCluster,
        @context context?: Context
    ): Promise<Waiter<model.EmptyResponse, model.ClusterDetails>> {
        const cancellationToken = context?.cancellationToken;

        await this._start(startCluster, context);

        return asWaiter(null, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

            return await retry<model.ClusterDetails>({
                timeout,
                fn: async () => {
                    const pollResponse = await this.get(
                        {
                            cluster_id: startCluster.cluster_id!,
                        },
                        context
                    );
                    if (cancellationToken?.isCancellationRequested) {
                        context?.logger?.error(
                            "Clusters.startAndWait: cancelled"
                        );
                        throw new ClustersError("startAndWait", "cancelled");
                    }
                    await onProgress(pollResponse);
                    const status = pollResponse.state;
                    const statusMessage = pollResponse.state_message;
                    switch (status) {
                        case "RUNNING": {
                            return pollResponse;
                        }
                        case "ERROR":
                        case "TERMINATED": {
                            const errorMessage = `failed to reach RUNNING state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `Clusters.startAndWait: ${errorMessage}`
                            );
                            throw new ClustersError(
                                "startAndWait",
                                errorMessage
                            );
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
        });
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _unpin(
        request: model.UnpinCluster,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/clusters/unpin";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Unpin cluster.
     *
     * Unpinning a cluster will allow the cluster to eventually be removed from
     * the ListClusters API. Unpinning a cluster that is not pinned will have no
     * effect. This API can only be called by workspace admins.
     */
    @withLogContext(ExposedLoggers.SDK)
    async unpin(
        request: model.UnpinCluster,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._unpin(request, context);
    }
}

export class CommandExecutionRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("CommandExecution", method, message);
    }
}
export class CommandExecutionError extends ApiError {
    constructor(method: string, message?: string) {
        super("CommandExecution", method, message);
    }
}

/**
 * This API allows execution of Python, Scala, SQL, or R commands on running
 * Databricks Clusters.
 */
export class CommandExecutionService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _cancel(
        request: model.CancelCommand,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/1.2/commands/cancel";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Cancel a command.
     *
     * Cancels a currently running command within an execution context.
     *
     * The command ID is obtained from a prior successful call to __execute__.
     */
    @withLogContext(ExposedLoggers.SDK)
    async cancel(
        cancelCommand: model.CancelCommand,
        @context context?: Context
    ): Promise<Waiter<model.EmptyResponse, model.CommandStatusResponse>> {
        const cancellationToken = context?.cancellationToken;

        await this._cancel(cancelCommand, context);

        return asWaiter(null, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

            return await retry<model.CommandStatusResponse>({
                timeout,
                fn: async () => {
                    const pollResponse = await this.commandStatus(
                        {
                            clusterId: cancelCommand.clusterId!,
                            commandId: cancelCommand.commandId!,
                            contextId: cancelCommand.contextId!,
                        },
                        context
                    );
                    if (cancellationToken?.isCancellationRequested) {
                        context?.logger?.error(
                            "CommandExecution.cancelAndWait: cancelled"
                        );
                        throw new CommandExecutionError(
                            "cancelAndWait",
                            "cancelled"
                        );
                    }
                    await onProgress(pollResponse);
                    const status = pollResponse.status;
                    const statusMessage = pollResponse.results!.cause;
                    switch (status) {
                        case "Cancelled": {
                            return pollResponse;
                        }
                        case "Error": {
                            const errorMessage = `failed to reach Cancelled state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `CommandExecution.cancelAndWait: ${errorMessage}`
                            );
                            throw new CommandExecutionError(
                                "cancelAndWait",
                                errorMessage
                            );
                        }
                        default: {
                            const errorMessage = `failed to reach Cancelled state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `CommandExecution.cancelAndWait: retrying: ${errorMessage}`
                            );
                            throw new CommandExecutionRetriableError(
                                "cancelAndWait",
                                errorMessage
                            );
                        }
                    }
                },
            });
        });
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _commandStatus(
        request: model.CommandStatusRequest,
        @context context?: Context
    ): Promise<model.CommandStatusResponse> {
        const path = "/api/1.2/commands/status";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.CommandStatusResponse;
    }

    /**
     * Get command info.
     *
     * Gets the status of and, if available, the results from a currently
     * executing command.
     *
     * The command ID is obtained from a prior successful call to __execute__.
     */
    @withLogContext(ExposedLoggers.SDK)
    async commandStatus(
        request: model.CommandStatusRequest,
        @context context?: Context
    ): Promise<model.CommandStatusResponse> {
        return await this._commandStatus(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _contextStatus(
        request: model.ContextStatusRequest,
        @context context?: Context
    ): Promise<model.ContextStatusResponse> {
        const path = "/api/1.2/contexts/status";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ContextStatusResponse;
    }

    /**
     * Get status.
     *
     * Gets the status for an execution context.
     */
    @withLogContext(ExposedLoggers.SDK)
    async contextStatus(
        request: model.ContextStatusRequest,
        @context context?: Context
    ): Promise<model.ContextStatusResponse> {
        return await this._contextStatus(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.CreateContext,
        @context context?: Context
    ): Promise<model.Created> {
        const path = "/api/1.2/contexts/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.Created;
    }

    /**
     * Create an execution context.
     *
     * Creates an execution context for running cluster commands.
     *
     * If successful, this method returns the ID of the new execution context.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        createContext: model.CreateContext,
        @context context?: Context
    ): Promise<Waiter<model.Created, model.ContextStatusResponse>> {
        const cancellationToken = context?.cancellationToken;

        const created = await this._create(createContext, context);

        return asWaiter(created, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

            return await retry<model.ContextStatusResponse>({
                timeout,
                fn: async () => {
                    const pollResponse = await this.contextStatus(
                        {
                            clusterId: createContext.clusterId!,
                            contextId: created.id!,
                        },
                        context
                    );
                    if (cancellationToken?.isCancellationRequested) {
                        context?.logger?.error(
                            "CommandExecution.createAndWait: cancelled"
                        );
                        throw new CommandExecutionError(
                            "createAndWait",
                            "cancelled"
                        );
                    }
                    await onProgress(pollResponse);
                    const status = pollResponse.status;
                    const statusMessage = pollResponse;
                    switch (status) {
                        case "Running": {
                            return pollResponse;
                        }
                        case "Error": {
                            const errorMessage = `failed to reach Running state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `CommandExecution.createAndWait: ${errorMessage}`
                            );
                            throw new CommandExecutionError(
                                "createAndWait",
                                errorMessage
                            );
                        }
                        default: {
                            const errorMessage = `failed to reach Running state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `CommandExecution.createAndWait: retrying: ${errorMessage}`
                            );
                            throw new CommandExecutionRetriableError(
                                "createAndWait",
                                errorMessage
                            );
                        }
                    }
                },
            });
        });
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _destroy(
        request: model.DestroyContext,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/1.2/contexts/destroy";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete an execution context.
     *
     * Deletes an execution context.
     */
    @withLogContext(ExposedLoggers.SDK)
    async destroy(
        request: model.DestroyContext,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._destroy(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _execute(
        request: model.Command,
        @context context?: Context
    ): Promise<model.Created> {
        const path = "/api/1.2/commands/execute";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.Created;
    }

    /**
     * Run a command.
     *
     * Runs a cluster command in the given execution context, using the provided
     * language.
     *
     * If successful, it returns an ID for tracking the status of the command's
     * execution.
     */
    @withLogContext(ExposedLoggers.SDK)
    async execute(
        command: model.Command,
        @context context?: Context
    ): Promise<Waiter<model.Created, model.CommandStatusResponse>> {
        const cancellationToken = context?.cancellationToken;

        const created = await this._execute(command, context);

        return asWaiter(created, async (options) => {
            options = options || {};
            options.onProgress =
                options.onProgress || (async (newPollResponse) => {});
            const {timeout, onProgress} = options;

            return await retry<model.CommandStatusResponse>({
                timeout,
                fn: async () => {
                    const pollResponse = await this.commandStatus(
                        {
                            clusterId: command.clusterId!,
                            commandId: created.id!,
                            contextId: command.contextId!,
                        },
                        context
                    );
                    if (cancellationToken?.isCancellationRequested) {
                        context?.logger?.error(
                            "CommandExecution.executeAndWait: cancelled"
                        );
                        throw new CommandExecutionError(
                            "executeAndWait",
                            "cancelled"
                        );
                    }
                    await onProgress(pollResponse);
                    const status = pollResponse.status;
                    const statusMessage = pollResponse;
                    switch (status) {
                        case "Finished":
                        case "Error": {
                            return pollResponse;
                        }
                        case "Cancelled":
                        case "Cancelling": {
                            const errorMessage = `failed to reach Finished or Error state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `CommandExecution.executeAndWait: ${errorMessage}`
                            );
                            throw new CommandExecutionError(
                                "executeAndWait",
                                errorMessage
                            );
                        }
                        default: {
                            const errorMessage = `failed to reach Finished or Error state, got ${status}: ${statusMessage}`;
                            context?.logger?.error(
                                `CommandExecution.executeAndWait: retrying: ${errorMessage}`
                            );
                            throw new CommandExecutionRetriableError(
                                "executeAndWait",
                                errorMessage
                            );
                        }
                    }
                },
            });
        });
    }
}

export class GlobalInitScriptsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("GlobalInitScripts", method, message);
    }
}
export class GlobalInitScriptsError extends ApiError {
    constructor(method: string, message?: string) {
        super("GlobalInitScripts", method, message);
    }
}

/**
 * The Global Init Scripts API enables Workspace administrators to configure
 * global initialization scripts for their workspace. These scripts run on every
 * node in every cluster in the workspace.
 *
 * **Important:** Existing clusters must be restarted to pick up any changes made
 * to global init scripts. Global init scripts are run in order. If the init
 * script returns with a bad exit code, the Apache Spark container fails to
 * launch and init scripts with later position are skipped. If enough containers
 * fail, the entire cluster fails with a `GLOBAL_INIT_SCRIPT_FAILURE` error code.
 */
export class GlobalInitScriptsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.GlobalInitScriptCreateRequest,
        @context context?: Context
    ): Promise<model.CreateResponse> {
        const path = "/api/2.0/global-init-scripts";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreateResponse;
    }

    /**
     * Create init script.
     *
     * Creates a new global init script in this workspace.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.GlobalInitScriptCreateRequest,
        @context context?: Context
    ): Promise<model.CreateResponse> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteGlobalInitScriptRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/global-init-scripts/${request.script_id}`;
        return (await this.client.request(
            path,
            "DELETE",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete init script.
     *
     * Deletes a global init script.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteGlobalInitScriptRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetGlobalInitScriptRequest,
        @context context?: Context
    ): Promise<model.GlobalInitScriptDetailsWithContent> {
        const path = `/api/2.0/global-init-scripts/${request.script_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GlobalInitScriptDetailsWithContent;
    }

    /**
     * Get an init script.
     *
     * Gets all the details of a script, including its Base64-encoded contents.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetGlobalInitScriptRequest,
        @context context?: Context
    ): Promise<model.GlobalInitScriptDetailsWithContent> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        @context context?: Context
    ): Promise<model.ListGlobalInitScriptsResponse> {
        const path = "/api/2.0/global-init-scripts";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.ListGlobalInitScriptsResponse;
    }

    /**
     * Get init scripts.
     *
     * Get a list of all global init scripts for this workspace. This returns all
     * properties for each script but **not** the script contents. To retrieve
     * the contents of a script, use the [get a global init
     * script](#operation/get-script) operation.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        @context context?: Context
    ): AsyncIterable<model.GlobalInitScriptDetails> {
        const response = (await this._list(context)).scripts;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _update(
        request: model.GlobalInitScriptUpdateRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = `/api/2.0/global-init-scripts/${request.script_id}`;
        return (await this.client.request(
            path,
            "PATCH",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Update init script.
     *
     * Updates a global init script, specifying only the fields to change. All
     * fields are optional. Unspecified fields retain their current value.
     */
    @withLogContext(ExposedLoggers.SDK)
    async update(
        request: model.GlobalInitScriptUpdateRequest,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._update(request, context);
    }
}

export class InstancePoolsRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("InstancePools", method, message);
    }
}
export class InstancePoolsError extends ApiError {
    constructor(method: string, message?: string) {
        super("InstancePools", method, message);
    }
}

/**
 * Instance Pools API are used to create, edit, delete and list instance pools by
 * using ready-to-use cloud instances which reduces a cluster start and
 * auto-scaling times.
 *
 * Databricks pools reduce cluster start and auto-scaling times by maintaining a
 * set of idle, ready-to-use instances. When a cluster is attached to a pool,
 * cluster nodes are created using the pool’s idle instances. If the pool has
 * no idle instances, the pool expands by allocating a new instance from the
 * instance provider in order to accommodate the cluster’s request. When a
 * cluster releases an instance, it returns to the pool and is free for another
 * cluster to use. Only clusters attached to a pool can use that pool’s idle
 * instances.
 *
 * You can specify a different pool for the driver node and worker nodes, or use
 * the same pool for both.
 *
 * Databricks does not charge DBUs while instances are idle in the pool. Instance
 * provider billing does apply. See pricing.
 */
export class InstancePoolsService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _create(
        request: model.CreateInstancePool,
        @context context?: Context
    ): Promise<model.CreateInstancePoolResponse> {
        const path = "/api/2.0/instance-pools/create";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.CreateInstancePoolResponse;
    }

    /**
     * Create a new instance pool.
     *
     * Creates a new instance pool using idle and ready-to-use cloud instances.
     */
    @withLogContext(ExposedLoggers.SDK)
    async create(
        request: model.CreateInstancePool,
        @context context?: Context
    ): Promise<model.CreateInstancePoolResponse> {
        return await this._create(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _delete(
        request: model.DeleteInstancePool,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/instance-pools/delete";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Delete an instance pool.
     *
     * Deletes the instance pool permanently. The idle instances in the pool are
     * terminated asynchronously.
     */
    @withLogContext(ExposedLoggers.SDK)
    async delete(
        request: model.DeleteInstancePool,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._delete(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _edit(
        request: model.EditInstancePool,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/instance-pools/edit";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Edit an existing instance pool.
     *
     * Modifies the configuration of an existing instance pool.
     */
    @withLogContext(ExposedLoggers.SDK)
    async edit(
        request: model.EditInstancePool,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._edit(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetInstancePoolRequest,
        @context context?: Context
    ): Promise<model.GetInstancePool> {
        const path = "/api/2.0/instance-pools/get";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.GetInstancePool;
    }

    /**
     * Get instance pool information.
     *
     * Retrieve the information for an instance pool based on its identifier.
     */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetInstancePoolRequest,
        @context context?: Context
    ): Promise<model.GetInstancePool> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        @context context?: Context
    ): Promise<model.ListInstancePools> {
        const path = "/api/2.0/instance-pools/list";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.ListInstancePools;
    }

    /**
     * List instance pool info.
     *
     * Gets a list of instance pools with their statistics.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        @context context?: Context
    ): AsyncIterable<model.InstancePoolAndStats> {
        const response = (await this._list(context)).instance_pools;
        for (const v of response || []) {
            yield v;
        }
    }
}

export class InstanceProfilesRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("InstanceProfiles", method, message);
    }
}
export class InstanceProfilesError extends ApiError {
    constructor(method: string, message?: string) {
        super("InstanceProfiles", method, message);
    }
}

/**
 * The Instance Profiles API allows admins to add, list, and remove instance
 * profiles that users can launch clusters with. Regular users can list the
 * instance profiles available to them. See [Secure access to S3 buckets] using
 * instance profiles for more information.
 *
 * [Secure access to S3 buckets]: https://docs.databricks.com/administration-guide/cloud-configurations/aws/instance-profiles.html
 */
export class InstanceProfilesService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _add(
        request: model.AddInstanceProfile,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/instance-profiles/add";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Register an instance profile.
     *
     * In the UI, you can select the instance profile when launching clusters.
     * This API is only available to admin users.
     */
    @withLogContext(ExposedLoggers.SDK)
    async add(
        request: model.AddInstanceProfile,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._add(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _edit(
        request: model.InstanceProfile,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/instance-profiles/edit";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Edit an instance profile.
     *
     * The only supported field to change is the optional IAM role ARN associated
     * with the instance profile. It is required to specify the IAM role ARN if
     * both of the following are true:
     *
     * * Your role name and instance profile name do not match. The name is the
     * part after the last slash in each ARN. * You want to use the instance
     * profile with [Databricks SQL Serverless].
     *
     * To understand where these fields are in the AWS console, see [Enable
     * serverless SQL warehouses].
     *
     * This API is only available to admin users.
     *
     * [Databricks SQL Serverless]: https://docs.databricks.com/sql/admin/serverless.html
     * [Enable serverless SQL warehouses]: https://docs.databricks.com/sql/admin/serverless.html
     */
    @withLogContext(ExposedLoggers.SDK)
    async edit(
        request: model.InstanceProfile,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._edit(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        @context context?: Context
    ): Promise<model.ListInstanceProfilesResponse> {
        const path = "/api/2.0/instance-profiles/list";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.ListInstanceProfilesResponse;
    }

    /**
     * List available instance profiles.
     *
     * List the instance profiles that the calling user can use to launch a
     * cluster.
     *
     * This API is available to all users.
     */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        @context context?: Context
    ): AsyncIterable<model.InstanceProfile> {
        const response = (await this._list(context)).instance_profiles;
        for (const v of response || []) {
            yield v;
        }
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _remove(
        request: model.RemoveInstanceProfile,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/instance-profiles/remove";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Remove the instance profile.
     *
     * Remove the instance profile with the provided ARN. Existing clusters with
     * this instance profile will continue to function.
     *
     * This API is only accessible to admin users.
     */
    @withLogContext(ExposedLoggers.SDK)
    async remove(
        request: model.RemoveInstanceProfile,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._remove(request, context);
    }
}

export class LibrariesRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("Libraries", method, message);
    }
}
export class LibrariesError extends ApiError {
    constructor(method: string, message?: string) {
        super("Libraries", method, message);
    }
}

/**
 * The Libraries API allows you to install and uninstall libraries and get the
 * status of libraries on a cluster.
 *
 * To make third-party or custom code available to notebooks and jobs running on
 * your clusters, you can install a library. Libraries can be written in Python,
 * Java, Scala, and R. You can upload Java, Scala, and Python libraries and point
 * to external packages in PyPI, Maven, and CRAN repositories.
 *
 * Cluster libraries can be used by all notebooks running on a cluster. You can
 * install a cluster library directly from a public repository such as PyPI or
 * Maven, using a previously installed workspace library, or using an init
 * script.
 *
 * When you install a library on a cluster, a notebook already attached to that
 * cluster will not immediately see the new library. You must first detach and
 * then reattach the notebook to the cluster.
 *
 * When you uninstall a library from a cluster, the library is removed only when
 * you restart the cluster. Until you restart the cluster, the status of the
 * uninstalled library appears as Uninstall pending restart.
 */
export class LibrariesService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _allClusterStatuses(
        @context context?: Context
    ): Promise<model.ListAllClusterLibraryStatusesResponse> {
        const path = "/api/2.0/libraries/all-cluster-statuses";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.ListAllClusterLibraryStatusesResponse;
    }

    /**
     * Get all statuses.
     *
     * Get the status of all libraries on all clusters. A status will be
     * available for all libraries installed on this cluster via the API or the
     * libraries UI as well as libraries set to be installed on all clusters via
     * the libraries UI.
     */
    @withLogContext(ExposedLoggers.SDK)
    async allClusterStatuses(
        @context context?: Context
    ): Promise<model.ListAllClusterLibraryStatusesResponse> {
        return await this._allClusterStatuses(context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _clusterStatus(
        request: model.ClusterStatusRequest,
        @context context?: Context
    ): Promise<model.ClusterLibraryStatuses> {
        const path = "/api/2.0/libraries/cluster-status";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ClusterLibraryStatuses;
    }

    /**
     * Get status.
     *
     * Get the status of libraries on a cluster. A status will be available for
     * all libraries installed on this cluster via the API or the libraries UI as
     * well as libraries set to be installed on all clusters via the libraries
     * UI. The order of returned libraries will be as follows.
     *
     * 1. Libraries set to be installed on this cluster will be returned first.
     * Within this group, the final order will be order in which the libraries
     * were added to the cluster.
     *
     * 2. Libraries set to be installed on all clusters are returned next. Within
     * this group there is no order guarantee.
     *
     * 3. Libraries that were previously requested on this cluster or on all
     * clusters, but now marked for removal. Within this group there is no order
     * guarantee.
     */
    @withLogContext(ExposedLoggers.SDK)
    async clusterStatus(
        request: model.ClusterStatusRequest,
        @context context?: Context
    ): Promise<model.ClusterLibraryStatuses> {
        return await this._clusterStatus(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _install(
        request: model.InstallLibraries,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/libraries/install";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Add a library.
     *
     * Add libraries to be installed on a cluster. The installation is
     * asynchronous; it happens in the background after the completion of this
     * request.
     *
     * **Note**: The actual set of libraries to be installed on a cluster is the
     * union of the libraries specified via this method and the libraries set to
     * be installed on all clusters via the libraries UI.
     */
    @withLogContext(ExposedLoggers.SDK)
    async install(
        request: model.InstallLibraries,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._install(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _uninstall(
        request: model.UninstallLibraries,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        const path = "/api/2.0/libraries/uninstall";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.EmptyResponse;
    }

    /**
     * Uninstall libraries.
     *
     * Set libraries to be uninstalled on a cluster. The libraries won't be
     * uninstalled until the cluster is restarted. Uninstalling libraries that
     * are not installed on the cluster will have no impact but is not an error.
     */
    @withLogContext(ExposedLoggers.SDK)
    async uninstall(
        request: model.UninstallLibraries,
        @context context?: Context
    ): Promise<model.EmptyResponse> {
        return await this._uninstall(request, context);
    }
}

export class PolicyFamiliesRetriableError extends ApiRetriableError {
    constructor(method: string, message?: string) {
        super("PolicyFamilies", method, message);
    }
}
export class PolicyFamiliesError extends ApiError {
    constructor(method: string, message?: string) {
        super("PolicyFamilies", method, message);
    }
}

/**
 * View available policy families. A policy family contains a policy definition
 * providing best practices for configuring clusters for a particular use case.
 *
 * Databricks manages and provides policy families for several common cluster use
 * cases. You cannot create, edit, or delete policy families.
 *
 * Policy families cannot be used directly to create clusters. Instead, you
 * create cluster policies using a policy family. Cluster policies created using
 * a policy family inherit the policy family's policy definition.
 */
export class PolicyFamiliesService {
    constructor(readonly client: ApiClient) {}

    @withLogContext(ExposedLoggers.SDK)
    private async _get(
        request: model.GetPolicyFamilyRequest,
        @context context?: Context
    ): Promise<model.PolicyFamily> {
        const path = `/api/2.0/policy-families/${request.policy_family_id}`;
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.PolicyFamily;
    }

    /**
        
        */
    @withLogContext(ExposedLoggers.SDK)
    async get(
        request: model.GetPolicyFamilyRequest,
        @context context?: Context
    ): Promise<model.PolicyFamily> {
        return await this._get(request, context);
    }

    @withLogContext(ExposedLoggers.SDK)
    private async _list(
        request: model.ListPolicyFamiliesRequest,
        @context context?: Context
    ): Promise<model.ListPolicyFamiliesResponse> {
        const path = "/api/2.0/policy-families";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ListPolicyFamiliesResponse;
    }

    /**
        
        */
    @withLogContext(ExposedLoggers.SDK)
    async *list(
        request: model.ListPolicyFamiliesRequest,
        @context context?: Context
    ): AsyncIterable<model.PolicyFamily> {
        while (true) {
            const response = await this._list(request, context);
            if (
                context?.cancellationToken &&
                context?.cancellationToken.isCancellationRequested
            ) {
                break;
            }

            if (
                !response.policy_families ||
                response.policy_families.length === 0
            ) {
                break;
            }

            for (const v of response.policy_families) {
                yield v;
            }

            request.page_token = response.next_page_token;
            if (!response.next_page_token) {
                break;
            }
        }
    }
}
