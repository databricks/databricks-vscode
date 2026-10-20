import {ProductVersion, WorkspaceClient} from "@databricks/sdk-experimental";
import {workspaceConfigs} from "../../vscode-objs/WorkspaceConfigs";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const extensionVersion = require("../../../package.json")
    .version as ProductVersion;

type WorkspaceClientConfig = ConstructorParameters<typeof WorkspaceClient>[0];

/** The SDK's fetch reads this to set `rejectUnauthorized` on each request. */
export function updateStrictSSLEnv() {
    if (workspaceConfigs.proxyStrictSSL) {
        delete process.env.DATABRICKS_SDK_PROXY_STRICT_SSL;
    } else {
        process.env.DATABRICKS_SDK_PROXY_STRICT_SSL = "false";
    }
}

export function createWorkspaceClient(
    config: WorkspaceClientConfig
): WorkspaceClient {
    updateStrictSSLEnv();
    return new WorkspaceClient(config, {
        product: "databricks-vscode",
        productVersion: extensionVersion,
    });
}
