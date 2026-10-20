import {ProductVersion, WorkspaceClient} from "@databricks/sdk-experimental";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const extensionVersion = require("../../../package.json")
    .version as ProductVersion;

type WorkspaceClientConfig = ConstructorParameters<typeof WorkspaceClient>[0];

export function createWorkspaceClient(
    config: WorkspaceClientConfig
): WorkspaceClient {
    return new WorkspaceClient(config, {
        product: "databricks-vscode",
        productVersion: extensionVersion,
    });
}
