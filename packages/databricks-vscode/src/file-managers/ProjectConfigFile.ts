import {AuthProvider} from "../configuration/auth/AuthProvider";
import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";
import {Loggers} from "../logger";
import {LocalUri, RemoteUri} from "../sync/SyncDestination";
import {WorkspaceStateManager} from "../vscode-objs/WorkspaceState";
import {DatabricksYamlFile} from "./DatabricksYamlFile";
import {ProjectJsonFile} from "./ProjectJsonFile";

export interface ProjectConfig {
    authProvider: AuthProvider;
    clusterId?: string;
    workspacePath?: RemoteUri;
}

export class ProjectConfigFile {
    readonly databricksYamlFile: DatabricksYamlFile;
    constructor(
        readonly projectJsonFile: ProjectJsonFile,
        databricksYamlFile?: DatabricksYamlFile
    ) {
        this.databricksYamlFile =
            databricksYamlFile ??
            new DatabricksYamlFile(projectJsonFile.authProvider.host);
    }

    get host() {
        return this.projectJsonFile.authProvider.host;
    }

    get authProvider() {
        return this.projectJsonFile.authProvider;
    }

    get clusterId() {
        return (
            this.databricksYamlFile.clusterId ??
            this.projectJsonFile.otherConfig?.clusterId
        );
    }

    set clusterId(clusterId: string | undefined) {
        this.databricksYamlFile.clusterId = clusterId;
    }

    get workspacePath(): RemoteUri | undefined {
        return (
            this.databricksYamlFile.workspacePath ??
            this.projectJsonFile.workspacePath
        );
    }

    set workspacePath(workspacePath: RemoteUri | undefined) {
        this.databricksYamlFile.workspacePath = workspacePath;
    }

    static fromConfig(config: ProjectConfig) {
        return new ProjectConfigFile(
            new ProjectJsonFile(config.authProvider, config),
            new DatabricksYamlFile(
                config.authProvider.host,
                config.clusterId,
                config.workspacePath
            )
        );
    }

    async write(rootPath: LocalUri, workspaceState: WorkspaceStateManager) {
        try {
            await this.databricksYamlFile.write(rootPath, workspaceState);
            await this.projectJsonFile.write(rootPath);
        } catch (e) {
            NamedLogger.getOrCreate(Loggers.Extension).error(
                "Error writing project config file",
                e
            );
        }
    }

    static async load(
        rootPath: LocalUri,
        cliPath: LocalUri,
        workspaceState: WorkspaceStateManager
    ): Promise<ProjectConfigFile> {
        let databricksYamlConfig: DatabricksYamlFile | undefined = undefined;
        try {
            databricksYamlConfig = await DatabricksYamlFile.load(
                rootPath,
                workspaceState
            );
        } catch (e: unknown) {
            NamedLogger.getOrCreate(Loggers.Extension).error(
                "Error parsing project config file (databricks.yaml)",
                e
            );
        }

        let projectJsonFile: ProjectJsonFile;
        try {
            projectJsonFile = await ProjectJsonFile.load(rootPath, cliPath);
        } catch (e: unknown) {
            NamedLogger.getOrCreate(Loggers.Extension).error(
                "Error parsing project config file (project.json)",
                e
            );
            throw e;
        }
        return new ProjectConfigFile(projectJsonFile, databricksYamlConfig);
    }
}
