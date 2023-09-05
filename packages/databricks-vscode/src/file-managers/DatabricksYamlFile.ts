import path from "path";
import {RemoteUri, LocalUri} from "../sync/SyncDestination";
import {FileUtils} from "../utils";
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

export class DatabricksYamlFile {
    constructor(
        readonly workspaceUrl: URL,
        public clusterId?: string,
        public workspacePath?: RemoteUri
    ) {}

    private toYaml() {
        const environments: DatabricksYaml["environments"] = {};
        /* eslint-disable @typescript-eslint/naming-convention */
        environments[DatabricksYamlFile.getTargetName()] = {
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

    static getTargetName() {
        return `databricks-ide`;
    }

    private static fromYaml(yaml: string) {
        const parsedConfig: DatabricksYaml = YAML.parse(yaml);
        const target =
            parsedConfig.environments[DatabricksYamlFile.getTargetName()];
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

    static async load(localProjectRootPath: LocalUri) {
        const databricksYamlPath =
            DatabricksYamlFile.getFilePath(localProjectRootPath);
        const rawConfig = await fs.readFile(databricksYamlPath.path, {
            encoding: "utf-8",
        });
        return DatabricksYamlFile.fromYaml(rawConfig);
    }

    async write(localProjectRootPath: LocalUri) {
        const databricksYamlPath =
            DatabricksYamlFile.getFilePath(localProjectRootPath);
        await fs.mkdir(path.dirname(databricksYamlPath.path), {
            recursive: true,
        });
        await FileUtils.writeFileIfDiff(databricksYamlPath.uri, this.toYaml());
    }
}
