import {Loggers} from "../logger";
import {readFile} from "fs/promises";
import {Uri} from "vscode";
import {FeatureManager} from "../feature-manager/FeatureManager";
import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";
import {NotebookInitScriptManager} from "../language/notebooks/NotebookInitScriptManager";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {MsPythonExtensionWrapper} from "../language/MsPythonExtensionWrapper";

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

export async function getIdeEnvVars() {
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

async function getUserAgent(
    connectionManager: ConnectionManager,
    pythonExtension: MsPythonExtensionWrapper
) {
    const client = connectionManager.workspaceClient?.apiClient;
    if (!client) {
        return;
    }
    const userAgent = [
        `${client.product}/${client.productVersion}`,
        `os/${process.platform}`,
    ];

    const env = await pythonExtension.pythonEnvironment;
    if (env && env.version) {
        const {major, minor} = env.version;
        userAgent.push(`python/${major}.${minor}`);
    }

    return userAgent.join(" ");
}

async function getPatToken(connectionManager: ConnectionManager) {
    const headers: Record<string, string> = {};
    await connectionManager.workspaceClient?.apiClient.config.authenticate(
        headers
    );
    return headers["Authorization"]?.split(" ")[1];
}

export async function getDatabrickseEnvVars(
    connectionManager: ConnectionManager,
    pythonExtension: MsPythonExtensionWrapper,
    workspacePath: Uri
) {
    await connectionManager.waitForConnect();
    const cluster = connectionManager.cluster;
    const userAgent = await getUserAgent(connectionManager, pythonExtension);
    const authProvider = connectionManager.databricksWorkspace?.authProvider;
    if (!userAgent || !authProvider) {
        return;
    }

    const authEnvVars: Record<string, string> = authProvider.toEnv();

    const host = connectionManager.databricksWorkspace?.host.authority;
    const pat = await getPatToken(connectionManager);
    const sparkEnvVars: Record<string, string> = {};
    if (pat && host && cluster) {
        sparkEnvVars[
            "SPARK_REMOTE"
        ] = `sc://${host}:443/;token=${pat};use_ssl=true;x-databricks-cluster-id=${cluster.id};user_agent=vs_code`; //;user_agent=${encodeURIComponent(userAgent)}`
    }

    /* eslint-disable @typescript-eslint/naming-convention */
    return {
        ...authEnvVars,
        ...sparkEnvVars,
        DATABRICKS_CLUSTER_ID: cluster?.id,
        DATABRICKS_PROJECT_ROOT: workspacePath.fsPath,
    };
    /* eslint-enable @typescript-eslint/naming-convention */
}
