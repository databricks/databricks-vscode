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
 * Databricks Managed Libraries REST API
 */
export class LibrariesService {
    constructor(readonly client: ApiClient) {}
    /**
     * Get all statuses
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
        const path = "/api/2.0/libraries/all-cluster-statuses";
        return (await this.client.request(
            path,
            "GET",
            undefined,
            context
        )) as model.ListAllClusterLibraryStatusesResponse;
    }

    /**
     * Get status
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
        const path = "/api/2.0/libraries/cluster-status";
        return (await this.client.request(
            path,
            "GET",
            request,
            context
        )) as model.ClusterLibraryStatuses;
    }

    /**
     * Add a library
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
    ): Promise<model.InstallLibrariesResponse> {
        const path = "/api/2.0/libraries/install";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.InstallLibrariesResponse;
    }

    /**
     * Uninstall libraries
     *
     * Set libraries to be uninstalled on a cluster. The libraries won't be
     * uninstalled until the cluster is restarted. Uninstalling libraries that
     * are not installed on the cluster will have no impact but is not an error.
     */
    @withLogContext(ExposedLoggers.SDK)
    async uninstall(
        request: model.UninstallLibraries,
        @context context?: Context
    ): Promise<model.UninstallLibrariesResponse> {
        const path = "/api/2.0/libraries/uninstall";
        return (await this.client.request(
            path,
            "POST",
            request,
            context
        )) as model.UninstallLibrariesResponse;
    }
}
