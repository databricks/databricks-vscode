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

/**
 * We have 2 config files: project.json and databricks.yaml.
 *
 * project.json stores stuff requrired only for the extension (eg, auth type etc).
 * Authentication for all the tools launched from vscode is through the metadata service.
 *
 * databricks.yaml stores everything we can configure from the extension and which
 * is relevant to create a valid dab.
 *
 * To support the old (single project.json) format, we fallback to reading the project.json
 * in getters, when a property is not present in databricks.yaml.
 *
 * We always write in the new format.
 */
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
        // We try to load the databricks.yaml file. If it fails, we still continue on to load
        // project.json, but we log the error.
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

        // If project.json fails to load, we throw the error.
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
