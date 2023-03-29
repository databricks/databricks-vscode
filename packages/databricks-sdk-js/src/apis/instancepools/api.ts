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
import {Waiter, asWaiter} from "../../wait";

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
        request: model.Get,
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
        request: model.Get,
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
    async list(@context context?: Context): Promise<model.ListInstancePools> {
        return await this._list(context);
    }
}
