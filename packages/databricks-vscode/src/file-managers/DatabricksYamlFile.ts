import path from "path";
import {RemoteUri, LocalUri} from "../sync/SyncDestination";
import {FileUtils} from "../utils";
import {WorkspaceStateManager} from "../vscode-objs/WorkspaceState";
import * as fs from "node:fs/promises";
import YAML from "yaml";

/* eslint-disable @typescript-eslint/naming-convention */
interface DatabricksYaml {
    environments: {
        [key: string]: {
            compute_id?: string;
            workspace: {
                host: string;
                root_path?: string;
            };
            mode: "development";
        };
    };
}
/* eslint-enable @typescript-eslint/naming-convention */

function getTargetName(workspaceState: WorkspaceStateManager) {
    return `databricks-vscode-${workspaceState.fixedUUID.slice(0, 8)}`;
}

export class DatabricksYamlFile {
    constructor(
        readonly workspaceUrl: URL,
        public clusterId?: string,
        public workspacePath?: RemoteUri
    ) {}

    private toYaml(workspaceState: WorkspaceStateManager) {
        const environments: DatabricksYaml["environments"] = {};
        /* eslint-disable @typescript-eslint/naming-convention */
        environments[getTargetName(workspaceState)] = {
            compute_id: this.clusterId,
            workspace: {
                host: this.workspaceUrl.toString(),
                root_path: this.workspacePath?.path,
            },
            mode: "development",
        };
        /* eslint-enable @typescript-eslint/naming-convention */

        const doc = new YAML.Document({environments});
        return doc.toString();
    }

    private static fromYaml(
        yaml: string,
        workspaceState: WorkspaceStateManager
    ) {
        const parsedConfig: DatabricksYaml = YAML.parse(yaml);
        const target = parsedConfig.environments[getTargetName(workspaceState)];
        return new DatabricksYamlFile(
            new URL(target.workspace.host),
            target.compute_id,
            target.workspace.root_path !== undefined
                ? new RemoteUri(target.workspace.root_path)
                : undefined
        );
    }

    static getFilePath(localProjectRootPath: LocalUri): LocalUri {
        return localProjectRootPath.join(".databricks", "databricks.yaml");
    }

    static async load(
        localProjectRootPath: LocalUri,
        workspaceState: WorkspaceStateManager
    ) {
        const databricksYamlPath =
            DatabricksYamlFile.getFilePath(localProjectRootPath);
        const rawConfig = await fs.readFile(databricksYamlPath.path, {
            encoding: "utf-8",
        });
        return DatabricksYamlFile.fromYaml(rawConfig, workspaceState);
    }

    async write(
        localProjectRootPath: LocalUri,
        workspaceState: WorkspaceStateManager
    ) {
        const databricksYamlPath =
            DatabricksYamlFile.getFilePath(localProjectRootPath);
        await fs.mkdir(path.dirname(databricksYamlPath.path), {
            recursive: true,
        });
        await FileUtils.writeFileIfDiff(
            databricksYamlPath.uri,
            this.toYaml(workspaceState)
        );
    }
}
