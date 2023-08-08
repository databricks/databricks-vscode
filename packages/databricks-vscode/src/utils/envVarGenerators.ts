import {Loggers} from "../logger";
import {readFile} from "fs/promises";
import {Uri} from "vscode";
import {FeatureManager} from "../feature-manager/FeatureManager";
import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";
import {NotebookInitScriptManager} from "../language/notebooks/NotebookInitScriptManager";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {DatabricksYamlFile} from "../file-managers/DatabricksYamlFile";

//Get env variables from user's .env file
export async function getUserEnvVars(userEnvPath: Uri) {
    try {
        return (await readFile(userEnvPath.fsPath, "utf-8"))
            .split(/\r?\n/)
            .map((value) => {
                const splits = value.split("=");
                return [splits[0], splits.slice(1).join("=")];
            })
            .filter(([key, value]) => key.length && value.length)
            .reduce((prev: Record<string, string>, cur) => {
                if (!Object.keys(prev).includes(cur[0])) {
                    prev[cur[0]] = cur[1];
                }
                return prev;
            }, {});
    } catch (e: unknown) {
        NamedLogger.getOrCreate(Loggers.Extension).error(
            "Can't load .env file",
            e
        );
    }
}

export function getIdeEnvVars() {
    /* eslint-disable @typescript-eslint/naming-convention */
    return {
        //https://github.com/fabioz/PyDev.Debugger/blob/main/_pydevd_bundle/pydevd_constants.py
        PYDEVD_WARN_SLOW_RESOLVE_TIMEOUT: "10",
    };
    /* eslint-enable @typescript-eslint/naming-convention */
}

export async function getNotebookEnvVars(
    featureManager: FeatureManager,
    notebookInitScriptManager: NotebookInitScriptManager
) {
    if (!(await featureManager.isEnabled("notebooks.dbconnect")).avaliable) {
        return;
    }

    /* eslint-disable @typescript-eslint/naming-convention */
    return {
        IPYTHONDIR: notebookInitScriptManager.ipythonDir,
    };
    /* eslint-enable @typescript-eslint/naming-convention */
}

function getUserAgent(connectionManager: ConnectionManager) {
    const client = connectionManager.workspaceClient?.apiClient;
    if (!client) {
        return;
    }
    return `${client.product}/${client.productVersion}`;
}

export function getAuthEnvVars(connectionManager: ConnectionManager) {
    const cluster = connectionManager.cluster;
    const host = connectionManager.databricksWorkspace?.host.authority;
    if (!host || !connectionManager.metadataServiceUrl) {
        return;
    }

    /* eslint-disable @typescript-eslint/naming-convention */
    return {
        DATABRICKS_HOST: host,
        DATABRICKS_AUTH_TYPE: "metadata-service",
        DATABRICKS_METADATA_SERVICE_URL: connectionManager.metadataServiceUrl,
        DATABRICKS_CLUSTER_ID: cluster?.id,
    };
    /* eslint-enable @typescript-eslint/naming-convention */
}

export function getCommonDatabricksEnvVars(
    connectionManager: ConnectionManager
) {
    /* eslint-disable @typescript-eslint/naming-convention */
    return {
        ...(getAuthEnvVars(connectionManager) || {}),
        ...(getProxyEnvVars() || {}),
    };
    /* eslint-enable @typescript-eslint/naming-convention */
}

export function getDatabricksCliEnvVars(connectionManager: ConnectionManager) {
    /* eslint-disable @typescript-eslint/naming-convention */
    return {
        BUNDLE_ROOT: connectionManager.workspaceRoot.path,
        DATABRICKS_BUNDLE_INCLUDES: DatabricksYamlFile.getFilePath(
            connectionManager.workspaceRoot
        ).path,
    };
    /* eslint-enable @typescript-eslint/naming-convention */
}

async function getPatToken(connectionManager: ConnectionManager) {
    const headers: Record<string, string> = {};
    await connectionManager.workspaceClient?.apiClient.config.authenticate(
        headers
    );
    return headers["Authorization"]?.split(" ")[1];
}

async function getSparkRemoteEnvVar(connectionManager: ConnectionManager) {
    const host = connectionManager.databricksWorkspace?.host.authority;
    const authType =
        connectionManager.databricksWorkspace?.authProvider.authType;

    // We export spark remote only for profile auth type. This is to support
    // SparkSession builder in oss spark connect (and also dbconnect).
    // For all other auth types, we don't export spark remote and expect users
    // to use DatabricksSession for full functionality.
    if (host && connectionManager.cluster && authType === "profile") {
        const pat = await getPatToken(connectionManager);
        if (pat) {
            return {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                SPARK_REMOTE: `sc://${host}:443/;token=${pat};use_ssl=true;x-databricks-cluster-id=${connectionManager.cluster.id}`,
            };
        }
    }
}

export async function getDbConnectEnvVars(
    connectionManager: ConnectionManager,
    workspacePath: Uri,
    featureManager: FeatureManager
) {
    if (!(await featureManager.isEnabled("debugging.dbconnect")).avaliable) {
        return;
    }
    const userAgent = getUserAgent(connectionManager);
    /* eslint-disable @typescript-eslint/naming-convention */
    return {
        SPARK_CONNECT_USER_AGENT: userAgent,
        DATABRICKS_PROJECT_ROOT: workspacePath.fsPath,
        ...((await getSparkRemoteEnvVar(connectionManager)) || {}),
    };
    /* eslint-enable @typescript-eslint/naming-convention */
}

export function getProxyEnvVars() {
    return {
        /* eslint-disable @typescript-eslint/naming-convention */
        HTTP_PROXY: process.env.HTTP_PROXY || process.env.http_proxy,
        HTTPS_PROXY: process.env.HTTPS_PROXY || process.env.https_proxy,
        /* eslint-enable @typescript-eslint/naming-convention */
    };
}

type Intersection<T> = {[K in keyof T]: T[K]};

export function removeUndefinedKeys<
    T extends Array<Record<string, string | undefined>>,
>(...envVarMaps: [...T]): Intersection<T[number]> {
    return envVarMaps
        .map((envVarMap) => {
            return Object.entries(envVarMap).filter(
                (entry) => entry[1] !== undefined
            ) as [string, string][];
        })
        .reduce((prev, cur) => {
            return Object.assign(prev, {...Object.fromEntries(cur)});
        }, {}) as Intersection<T[number]>;
}
