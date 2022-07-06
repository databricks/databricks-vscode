/* eslint-disable @typescript-eslint/naming-convention */

import {ApiClient} from "../api-client";

import * as delegate from "./delegate";

//
// Enums.
//

export type LibraryInstallStatus =
    | "PENDING"
    | "RESOLVING"
    | "INSTALLING"
    | "INSTALLED"
    | "FAILED"
    | "UNINSTALL_ON_RESTART"
    | "SKIPPED";

//
// Subtypes used in request/response types.
//

export interface PythonPyPiLibrary {
    package: string;
    repo?: string;
}

export interface RCranLibrary {
    package: string;
    repo?: string;
}

export interface MavenLibrary {
    coordinates: string;
    repo?: string;
    exclusions?: Array<string>;
}

export interface Library {
    jar?: string;
    egg?: string;
    pypi?: PythonPyPiLibrary;
    maven?: MavenLibrary;
    cran?: RCranLibrary;
    whl?: string;
}

export interface LibraryFullStatus {
    library?: Library;
    status?: LibraryInstallStatus;
    messages?: Array<string>;
    is_library_for_all_clusters?: boolean;
}

export interface ClusterLibraryStatuses {
    cluster_id?: string;
    library_statuses?: Array<LibraryFullStatus>;
}

//
// Request/response types.
//

export interface ClusterStatusRequest {
    cluster_id: string;
}

export interface ClusterStatusResponse {
    cluster_id?: string;
    library_statuses?: Array<LibraryFullStatus>;
}

export interface ListAllClusterLibraryStatusesRequest {}

export interface ListAllClusterLibraryStatusesResponse {
    statuses?: Array<ClusterLibraryStatuses>;
}

export interface InstallLibrariesRequest {
    cluster_id: string;
    libraries?: Array<Library>;
}

export interface InstallLibrariesResponse {}

export interface UninstallLibrariesRequest {
    cluster_id: string;
    libraries?: Array<Library>;
}

export interface UninstallLibrariesResponse {}

export class ManagedLibraryService {
    readonly client: ApiClient;

    constructor(client: ApiClient) {
        this.client = client;
    }

    async clusterStatus(
        request: ClusterStatusRequest
    ): Promise<ClusterStatusResponse> {
        return (await this.client.request(
            "/api/2.0/libraries/cluster-status",
            "GET",
            request
        )) as ClusterStatusResponse;
    }

    async allClusterStatuses(
        request: ListAllClusterLibraryStatusesRequest
    ): Promise<ListAllClusterLibraryStatusesResponse> {
        return (await this.client.request(
            "/api/2.0/libraries/all-cluster-statuses",
            "GET",
            request
        )) as ListAllClusterLibraryStatusesResponse;
    }

    async installLibraries(
        request: InstallLibrariesRequest
    ): Promise<InstallLibrariesResponse> {
        return (await this.client.request(
            "/api/2.0/libraries/install",
            "POST",
            request
        )) as InstallLibrariesResponse;
    }

    async uninstallLibraries(
        request: UninstallLibrariesRequest
    ): Promise<UninstallLibrariesResponse> {
        return (await this.client.request(
            "/api/2.0/libraries/uninstall",
            "POST",
            request
        )) as UninstallLibrariesResponse;
    }
}
