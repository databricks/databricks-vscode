/* eslint-disable @typescript-eslint/naming-convention */

// Code generated from OpenAPI specs by Databricks SDK Generator. DO NOT EDIT.

// all definitions in this file are in alphabetical order
export interface ClusterLibraryStatuses {
    /**
     * Unique identifier for the cluster.
     */
    cluster_id?: string;
    /**
     * Status of all libraries on the cluster.
     */
    library_statuses?: Array<LibraryFullStatus>;
}

export interface InstallLibraries {
    /**
     * Unique identifier for the cluster on which to install these libraries.
     */
    cluster_id: string;
    /**
     * The libraries to install.
     */
    libraries?: Array<Library>;
}

export interface Library {
    /**
     * Specification of a CRAN library to be installed as part of the library
     */
    cran?: RCranLibrary;
    /**
     * URI of the egg to be installed. Currently only DBFS and S3 URIs are
     * supported. For example: ``{ "egg": "dbfs:/my/egg" }`` or ``{ "egg":
     * "s3://my-bucket/egg" }``. If S3 is used, please make sure the cluster has
     * read access on the library. You may need to launch the cluster with an IAM
     * role to access the S3 URI.
     */
    egg?: string;
    /**
     * URI of the jar to be installed. Currently only DBFS and S3 URIs are
     * supported. For example: ``{ "jar": "dbfs:/mnt/databricks/library.jar" }``
     * or ``{ "jar": "s3://my-bucket/library.jar" }``. If S3 is used, please make
     * sure the cluster has read access on the library. You may need to launch
     * the cluster with an IAM role to access the S3 URI.
     */
    jar?: string;
    /**
     * Specification of a maven library to be installed. For example: ``{
     * "coordinates": "org.jsoup:jsoup:1.7.2" }``
     */
    maven?: MavenLibrary;
    /**
     * Specification of a PyPi library to be installed. For example: ``{
     * "package": "simplejson" }``
     */
    pypi?: PythonPyPiLibrary;
    /**
     * URI of the wheel to be installed. For example: ``{ "whl": "dbfs:/my/whl"
     * }`` or ``{ "whl": "s3://my-bucket/whl" }``. If S3 is used, please make
     * sure the cluster has read access on the library. You may need to launch
     * the cluster with an IAM role to access the S3 URI.
     */
    whl?: string;
}

export interface LibraryFullStatus {
    /**
     * Whether the library was set to be installed on all clusters via the
     * libraries UI.
     */
    is_library_for_all_clusters?: boolean;
    /**
     * Unique identifier for the library.
     */
    library?: Library;
    /**
     * All the info and warning messages that have occurred so far for this
     * library.
     */
    messages?: Array<string>;
    /**
     * Status of installing the library on the cluster.
     */
    status?: LibraryFullStatusStatus;
}

/**
 * Status of installing the library on the cluster.
 */
export type LibraryFullStatusStatus =
    | "FAILED"
    | "INSTALLED"
    | "INSTALLING"
    | "PENDING"
    | "RESOLVING"
    | "SKIPPED"
    | "UNINSTALL_ON_RESTART";

export interface ListAllClusterLibraryStatusesResponse {
    /**
     * A list of cluster statuses.
     */
    statuses?: Array<ClusterLibraryStatuses>;
}

export interface MavenLibrary {
    /**
     * Gradle-style maven coordinates. For example: "org.jsoup:jsoup:1.7.2".
     */
    coordinates: string;
    /**
     * List of dependences to exclude. For example: ``["slf4j:slf4j",
     * "*:hadoop-client"]``.
     *
     * Maven dependency exclusions:
     * https://maven.apache.org/guides/introduction/introduction-to-optional-and-excludes-dependencies.html.
     */
    exclusions?: Array<string>;
    /**
     * Maven repo to install the Maven package from. If omitted, both Maven
     * Central Repository and Spark Packages are searched.
     */
    repo?: string;
}

export interface PythonPyPiLibrary {
    /**
     * The name of the pypi package to install. An optional exact version
     * specification is also supported. Examples: "simplejson" and
     * "simplejson==3.8.0".
     */
    package: string;
    /**
     * The repository where the package can be found. If not specified, the
     * default pip index is used.
     */
    repo?: string;
}

export interface RCranLibrary {
    /**
     * The name of the CRAN package to install.
     */
    package: string;
    /**
     * The repository where the package can be found. If not specified, the
     * default CRAN repo is used.
     */
    repo?: string;
}

export interface UninstallLibraries {
    /**
     * Unique identifier for the cluster on which to uninstall these libraries.
     */
    cluster_id: string;
    /**
     * The libraries to uninstall.
     */
    libraries?: Array<Library>;
}

export interface ClusterStatusRequest {
    /**
     * Unique identifier of the cluster whose status should be retrieved.
     */
    cluster_id: string;
}

export interface InstallLibrariesResponse {}
export interface UninstallLibrariesResponse {}
