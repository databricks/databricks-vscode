/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

import {ApiClient} from "../../api-client";
import * as model from "./model";
import Time from "../../retries/Time";
import retry, {RetriableError} from "../../retries/retries";
export class ClustersRetriableError extends RetriableError {}
export class ClustersError extends Error {}
// <needs content added>
export class ClustersService {
    constructor(readonly client: ApiClient) {}
    // Public version of editClusterOwner, allowing admins to change cluster
    // owner
    async changeOwner(
        request: model.ChangeClusterOwner
    ): Promise<model.ChangeClusterOwnerResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/change-owner",
            "POST",
            request
        )) as model.ChangeClusterOwnerResponse;
    }

    // Creates a new Spark cluster. This method will acquire new instances from
    // the cloud provider if necessary. This method is asynchronous; the
    // returned ``cluster_id`` can be used to poll the cluster status. When this
    // method returns, the cluster will be in a ``PENDING`` state. The cluster
    // will be usable once it enters a ``RUNNING`` state. Note: Databricks may
    // not be able to acquire some of the requested nodes, due to cloud provider
    // limitations (account limits, spot price, ...) or transient network
    // issues. If Databricks acquires at least 85% of the requested on-demand
    // nodes, cluster creation will succeed. Otherwise the cluster will
    // terminate with an informative error message. An example request: ..
    // code:: { "cluster_name": "my-cluster", "spark_version":
    // "2.0.x-scala2.10", "node_type_id": "r3.xlarge", "spark_conf": {
    // "spark.speculation": true }, "aws_attributes": { "availability": "SPOT",
    // "zone_id": "us-west-2a" }, "num_workers": 25 } See below as an example
    // for an autoscaling cluster. Note that this cluster will start with `2`
    // nodes, the minimum. .. code:: { "cluster_name": "autoscaling-cluster",
    // "spark_version": "2.0.x-scala2.10", "node_type_id": "r3.xlarge",
    // "autoscale" : { "min_workers": 2, "max_workers": 50 } }
    async create(
        request: model.CreateCluster
    ): Promise<model.CreateClusterResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/create",
            "POST",
            request
        )) as model.CreateClusterResponse;
    }

    // create and wait to reach RUNNING state
    //  or fail on reaching ERROR state
    async createAndWait(
        request: model.CreateCluster,
        timeout?: Time
    ): Promise<model.ClusterInfo> {
        const response = await this.create(request);

        return await retry<model.ClusterInfo>({
            timeout: timeout,
            fn: async () => {
                const pollResponse = await this.get({
                    ...model.DefaultGetRequest,
                    cluster_id: response.cluster_id,
                });
                const status = pollResponse.state;
                const statusMessage = pollResponse.state_message;
                switch (status) {
                    case "RUNNING": {
                        return pollResponse;
                    }
                    case "ERROR": {
                        throw new ClustersError(
                            `failed to reach RUNNING state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new ClustersRetriableError(
                            `failed to reach RUNNING state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    // Terminates a Spark cluster given its id. The cluster is removed
    // asynchronously. Once the termination has completed, the cluster will be
    // in a ``TERMINATED`` state. If the cluster is already in a ``TERMINATING``
    // or ``TERMINATED`` state, nothing will happen. An example request: ..
    // code:: { "cluster_id": "1202-211320-brick1" }
    async delete(
        request: model.DeleteCluster
    ): Promise<model.DeleteClusterResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/delete",
            "POST",
            request
        )) as model.DeleteClusterResponse;
    }

    // delete and wait to reach TERMINATED state
    //  or fail on reaching ERROR state
    async deleteAndWait(
        request: model.DeleteCluster,
        timeout?: Time
    ): Promise<model.ClusterInfo> {
        const response = await this.delete(request);

        return await retry<model.ClusterInfo>({
            timeout: timeout,
            fn: async () => {
                const pollResponse = await this.get({
                    ...model.DefaultGetRequest,
                    cluster_id: request.cluster_id,
                });
                const status = pollResponse.state;
                const statusMessage = pollResponse.state_message;
                switch (status) {
                    case "TERMINATED": {
                        return pollResponse;
                    }
                    case "ERROR": {
                        throw new ClustersError(
                            `failed to reach TERMINATED state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new ClustersRetriableError(
                            `failed to reach TERMINATED state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    // Edits the configuration of a cluster to match the provided attributes and
    // size. A cluster can be edited if it is in a ``RUNNING`` or ``TERMINATED``
    // state. If a cluster is edited while in a ``RUNNING`` state, it will be
    // restarted so that the new attributes can take effect. If a cluster is
    // edited while in a ``TERMINATED`` state, it will remain ``TERMINATED``.
    // The next time it is started using the ``clusters/start`` API, the new
    // attributes will take effect. An attempt to edit a cluster in any other
    // state will be rejected with an ``INVALID_STATE`` error code. Clusters
    // created by the Databricks Jobs service cannot be edited. An example
    // request: .. code:: { "cluster_id": "1202-211320-brick1", "num_workers":
    // 10, "spark_version": "3.3.x-scala2.11", "node_type_id": "i3.2xlarge" }
    async edit(request: model.EditCluster): Promise<model.EditClusterResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/edit",
            "POST",
            request
        )) as model.EditClusterResponse;
    }

    // edit and wait to reach RUNNING state
    //  or fail on reaching ERROR state
    async editAndWait(
        request: model.EditCluster,
        timeout?: Time
    ): Promise<model.ClusterInfo> {
        const response = await this.edit(request);

        return await retry<model.ClusterInfo>({
            timeout: timeout,
            fn: async () => {
                const pollResponse = await this.get({
                    ...model.DefaultGetRequest,
                    cluster_id: request.cluster_id,
                });
                const status = pollResponse.state;
                const statusMessage = pollResponse.state_message;
                switch (status) {
                    case "RUNNING": {
                        return pollResponse;
                    }
                    case "ERROR": {
                        throw new ClustersError(
                            `failed to reach RUNNING state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new ClustersRetriableError(
                            `failed to reach RUNNING state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    // Retrieves a list of events about the activity of a cluster. This API is
    // paginated. If there are more events to read, the response includes all
    // the parameters necessary to request the next page of events. An example
    // request: ``/clusters/events?cluster_id=1202-211320-brick1`` An example
    // response: { "events": [ { "cluster_id": "1202-211320-brick1",
    // "timestamp": 1509572145487, "event_type": "RESTARTING", "event_details":
    // { "username": "admin" } }, ... { "cluster_id": "1202-211320-brick1",
    // "timestamp": 1509505807923, "event_type": "TERMINATING", "event_details":
    // { "termination_reason": { "code": "USER_REQUEST", "parameters": [
    // "username": "admin" ] } } ], "next_page": { "cluster_id":
    // "1202-211320-brick1", "end_time": 1509572145487, "order": "DESC",
    // "offset": 50 }, "total_count": 303 } Example request to retrieve the next
    // page of events
    // ``/clusters/events?cluster_id=1202-211320-brick1&end_time=1509572145487&order=DESC&offset=50``
    async events(request: model.GetEvents): Promise<model.GetEventsResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/events",
            "POST",
            request
        )) as model.GetEventsResponse;
    }

    // Retrieves the information for a cluster given its identifier. Clusters
    // can be described while they are running, or up to 60 days after they are
    // terminated. An example request:
    // ``/clusters/get?cluster_id=1202-211320-brick1``
    async get(request: model.GetRequest): Promise<model.ClusterInfo> {
        return (await this.client.request(
            "/api/2.0/clusters/get",
            "GET",
            request
        )) as model.ClusterInfo;
    }

    // get and wait to reach RUNNING state
    //  or fail on reaching ERROR state
    async getAndWait(
        request: model.GetRequest,
        timeout?: Time
    ): Promise<model.ClusterInfo> {
        const response = await this.get(request);

        return await retry<model.ClusterInfo>({
            timeout: timeout,
            fn: async () => {
                const pollResponse = await this.get({
                    ...model.DefaultGetRequest,
                    cluster_id: response.cluster_id,
                });
                const status = pollResponse.state;
                const statusMessage = pollResponse.state_message;
                switch (status) {
                    case "RUNNING": {
                        return pollResponse;
                    }
                    case "ERROR": {
                        throw new ClustersError(
                            `failed to reach RUNNING state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new ClustersRetriableError(
                            `failed to reach RUNNING state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    // Returns information about all pinned clusters, currently active clusters,
    // up to 70 of the most recently terminated interactive clusters in the past
    // 7 days, and up to 30 of the most recently terminated job clusters in the
    // past 7 days. For example, if there is 1 pinned cluster, 4 active
    // clusters, 45 terminated interactive clusters in the past 7 days, and 50
    // terminated job clusters in the past 7 days, then this API returns the 1
    // pinned cluster, 4 active clusters, all 45 terminated interactive
    // clusters, and the 30 most recently terminated job clusters.
    async list(
        request: model.ListRequest
    ): Promise<model.ListClustersResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/list",
            "GET",
            request
        )) as model.ListClustersResponse;
    }

    // Returns a list of supported Spark node types. These node types can be
    // used to launch a cluster.
    async listNodeTypes(): Promise<model.ListNodeTypesResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/list-node-types",
            "GET"
        )) as model.ListNodeTypesResponse;
    }

    // Returns a list of availability zones where clusters can be created in
    // (ex: us-west-2a). These zones can be used to launch a cluster.
    async listZones(): Promise<model.ListAvailableZonesResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/list-zones",
            "GET"
        )) as model.ListAvailableZonesResponse;
    }

    // Permanently deletes a Spark cluster. This cluster is terminated and
    // resources are asynchronously removed. In addition, users will no longer
    // see permanently deleted clusters in the cluster list, and API users can
    // no longer perform any action on permanently deleted clusters. An example
    // request: .. code:: { "cluster_id": "1202-211320-brick1" }
    async permanentDelete(
        request: model.PermanentDeleteCluster
    ): Promise<model.PermanentDeleteClusterResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/permanent-delete",
            "POST",
            request
        )) as model.PermanentDeleteClusterResponse;
    }

    // Pinning a cluster ensures that the cluster will always be returned by the
    // ListClusters API. Pinning a cluster that is already pinned will have no
    // effect. This API can only be called by workspace admins. An example
    // request: ``/clusters/pin?cluster_id=1202-211320-brick1``
    async pin(request: model.PinCluster): Promise<model.PinClusterResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/pin",
            "POST",
            request
        )) as model.PinClusterResponse;
    }

    // Resizes a cluster to have a desired number of workers. This will fail
    // unless the cluster is in a ``RUNNING`` state. An example request: ..
    // code:: { "cluster_id": "1202-211320-brick1", "num_workers": 30 }
    async resize(
        request: model.ResizeCluster
    ): Promise<model.ResizeClusterResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/resize",
            "POST",
            request
        )) as model.ResizeClusterResponse;
    }

    // resize and wait to reach RUNNING state
    //  or fail on reaching ERROR state
    async resizeAndWait(
        request: model.ResizeCluster,
        timeout?: Time
    ): Promise<model.ClusterInfo> {
        const response = await this.resize(request);

        return await retry<model.ClusterInfo>({
            timeout: timeout,
            fn: async () => {
                const pollResponse = await this.get({
                    ...model.DefaultGetRequest,
                    cluster_id: request.cluster_id,
                });
                const status = pollResponse.state;
                const statusMessage = pollResponse.state_message;
                switch (status) {
                    case "RUNNING": {
                        return pollResponse;
                    }
                    case "ERROR": {
                        throw new ClustersError(
                            `failed to reach RUNNING state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new ClustersRetriableError(
                            `failed to reach RUNNING state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    // Restarts a Spark cluster given its id. If the cluster is not currently in
    // a ``RUNNING`` state, nothing will happen. An example request: .. code:: {
    // "cluster_id": "1202-211320-brick1" }
    async restart(
        request: model.RestartCluster
    ): Promise<model.RestartClusterResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/restart",
            "POST",
            request
        )) as model.RestartClusterResponse;
    }

    // restart and wait to reach RUNNING state
    //  or fail on reaching ERROR state
    async restartAndWait(
        request: model.RestartCluster,
        timeout?: Time
    ): Promise<model.ClusterInfo> {
        const response = await this.restart(request);

        return await retry<model.ClusterInfo>({
            timeout: timeout,
            fn: async () => {
                const pollResponse = await this.get({
                    ...model.DefaultGetRequest,
                    cluster_id: request.cluster_id,
                });
                const status = pollResponse.state;
                const statusMessage = pollResponse.state_message;
                switch (status) {
                    case "RUNNING": {
                        return pollResponse;
                    }
                    case "ERROR": {
                        throw new ClustersError(
                            `failed to reach RUNNING state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new ClustersRetriableError(
                            `failed to reach RUNNING state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    // Returns the list of available Spark versions. These versions can be used
    // to launch a cluster.
    async sparkVersions(): Promise<model.GetSparkVersionsResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/spark-versions",
            "GET"
        )) as model.GetSparkVersionsResponse;
    }

    // Starts a terminated Spark cluster given its id. This works similar to
    // `createCluster` except: - The previous cluster id and attributes are
    // preserved. - The cluster starts with the last specified cluster size. -
    // If the previous cluster was an autoscaling cluster, the current cluster
    // starts with the minimum number of nodes. - If the cluster is not
    // currently in a ``TERMINATED`` state, nothing will happen. - Clusters
    // launched to run a job cannot be started. An example request: .. code:: {
    // "cluster_id": "1202-211320-brick1" }
    async start(
        request: model.StartCluster
    ): Promise<model.StartClusterResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/start",
            "POST",
            request
        )) as model.StartClusterResponse;
    }

    // start and wait to reach RUNNING state
    //  or fail on reaching ERROR state
    async startAndWait(
        request: model.StartCluster,
        timeout?: Time
    ): Promise<model.ClusterInfo> {
        const response = await this.start(request);

        return await retry<model.ClusterInfo>({
            timeout: timeout,
            fn: async () => {
                const pollResponse = await this.get({
                    ...model.DefaultGetRequest,
                    cluster_id: request.cluster_id,
                });
                const status = pollResponse.state;
                const statusMessage = pollResponse.state_message;
                switch (status) {
                    case "RUNNING": {
                        return pollResponse;
                    }
                    case "ERROR": {
                        throw new ClustersError(
                            `failed to reach RUNNING state, got ${status}: ${statusMessage}`
                        );
                    }
                    default: {
                        throw new ClustersRetriableError(
                            `failed to reach RUNNING state, got ${status}: ${statusMessage}`
                        );
                    }
                }
            },
        });
    }

    // Unpinning a cluster will allow the cluster to eventually be removed from
    // the ListClusters API. Unpinning a cluster that is not pinned will have no
    // effect. This API can only be called by workspace admins. An example
    // request: ``/clusters/unpin?cluster_id=1202-211320-brick1``
    async unpin(
        request: model.UnpinCluster
    ): Promise<model.UnpinClusterResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/unpin",
            "POST",
            request
        )) as model.UnpinClusterResponse;
    }
}
