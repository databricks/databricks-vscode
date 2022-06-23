/* eslint-disable @typescript-eslint/naming-convention */

import {ApiClient} from "../api-client";

export type ClusterState =
    | "PENDING"
    | "RUNNING"
    | "RESTARTING"
    | "RESIZING"
    | "TERMINATING"
    | "TERMINATED"
    | "ERROR"
    | "UNKNOWN";

export interface ClustersListRequest {}
export interface ClustersListResponse {
    clusters: Array<{
        cluster_id: string;
        creator_user_name: string;
        spark_context_id: number;
        cluster_name: string;
        spark_version: string;
        node_type_id: string;
        driver_node_type_id: string;
        state: ClusterState;
        start_time: number;
        state_message: string;
        cluster_memory_mb: number;
        cluster_cores: number;
    }>;
}

export interface ClustersCreateRequest {
    cluster_name: string;
    spark_version: string;
    node_type_id: string;
    spark_conf?: Record<string, any>;
    aws_attributes?: Record<string, any>;
    custom_tags?: Record<string, string>;
    spark_env_vars?: Record<string, string>;
    autotermination_minutes?: number;
    init_scripts?: Array<any>; //TODO
    policy_id?: string;
    num_workers: number;
    cluster_log_conf?: any; // TODO
    autoscale?: {
        min_workers: number;
        max_workers: number;
    };
    ssh_public_keys?: Array<string>;
    // TODO more fields missing here
}

export interface ClustersCreateResponse {
    cluster_id: string;
}

export interface ClustersTerminateRequest {
    cluster_id: string;
}

export interface ClustersTerminateResponse {}

export interface ClustersDeleteRequest {
    cluster_id: string;
}

export interface ClustersDeleteResponse {}

export interface ClustersGetRequest {
    cluster_id: string;
}

export interface ClustersStartRequest {
    cluster_id: string;
}

export interface ClustersStartResponse {}

export interface ClustersGetResponse {
    cluster_id: string;
    spark_context_id: string;
    cluster_source: "UI" | "JOB" | "API";
    state: ClusterState;
    state_message: string;

    cluster_name: string;
    spark_version: string;
    node_type_id: string;
    spark_conf?: Record<string, any>;
    aws_attributes?: Record<string, any>;
    custom_tags?: Record<string, string>;
    spark_env_vars?: Record<string, string>;
    autotermination_minutes?: number;
    init_scripts?: Array<any>; //TODO
    policy_id?: string;
    num_workers: number;
    cluster_log_conf?: any; // TODO
    autoscale?: {
        min_workers: number;
        max_workers: number;
    };
    ssh_public_keys?: Array<string>;
    // TODO more fields missing here
}

export class ClustersApi {
    readonly client: ApiClient;

    constructor(client: ApiClient) {
        this.client = client;
    }

    async list(req: ClustersListRequest): Promise<ClustersListResponse> {
        return (await this.client.request(
            "/api/2.0/clusters/list",
            "GET",
            req
        )) as ClustersListResponse;
    }

    async create(req: ClustersCreateRequest): Promise<ClustersCreateResponse> {
        return (await this.client.request(
            "api/2.0/clusters/create",
            "POST",
            req
        )) as ClustersCreateResponse;
    }

    async terminate(
        req: ClustersTerminateRequest
    ): Promise<ClustersTerminateResponse> {
        return (await this.client.request(
            "api/2.0/clusters/delete",
            "POST",
            req
        )) as ClustersTerminateResponse;
    }

    async delete(req: ClustersDeleteRequest): Promise<ClustersDeleteResponse> {
        return (await this.client.request(
            "api/2.0/clusters/permanent-delete",
            "POST",
            req
        )) as ClustersDeleteResponse;
    }

    async get(req: ClustersGetRequest): Promise<ClustersGetResponse> {
        return (await this.client.request(
            "api/2.0/clusters/get",
            "GET",
            req
        )) as ClustersGetResponse;
    }

    async start(req: ClustersStartRequest): Promise<ClustersStartResponse> {
        return (await this.client.request(
            "api/2.0/clusters/start",
            "POST",
            req
        )) as ClustersStartResponse;
    }
}
