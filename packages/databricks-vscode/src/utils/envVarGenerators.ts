import {Loggers} from "../logger";
import {readFile} from "fs/promises";
import {Uri} from "vscode";
import {FeatureManager} from "../feature-manager/FeatureManager";
import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";
import {NotebookInitScriptManager} from "../language/notebooks/NotebookInitScriptManager";
import {ConnectionManager} from "../configuration/ConnectionManager";

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

export function getDbConnectEnvVars(
    connectionManager: ConnectionManager,
    workspacePath: Uri
) {
    const userAgent = getUserAgent(connectionManager);

    /* eslint-disable @typescript-eslint/naming-convention */
    return {
        SPARK_CONNECT_USER_AGENT: userAgent,
        DATABRICKS_PROJECT_ROOT: workspacePath.fsPath,
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

export function removeUndefinedKeys<
    T extends Record<string, string | undefined>
>(envVarMap?: T): T | undefined {
    if (envVarMap === undefined) {
        return;
    }

    const filteredEntries = Object.entries(envVarMap).filter(
        (entry) => entry[1] !== undefined
    ) as [string, string][];

    return Object.fromEntries<string>(filteredEntries) as T;
}
