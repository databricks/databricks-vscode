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
        request: model.ClusterStatus,
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
        request: model.ClusterStatus,
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
