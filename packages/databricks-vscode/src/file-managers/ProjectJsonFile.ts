import {Config} from "@databricks/databricks-sdk";
import path from "path";
import {
    AuthProvider,
    ProfileAuthProvider,
} from "../configuration/auth/AuthProvider";
import {RemoteUri, LocalUri} from "../sync/SyncDestination";
import {FileUtils} from "../utils";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import * as fs from "node:fs/promises";

export class ProjectJsonFile {
    constructor(
        readonly authProvider: AuthProvider,
        readonly otherConfig?: Record<string, any>
    ) {}

    get workspacePath() {
        return this.otherConfig?.workspacePath !== undefined
            ? new RemoteUri(this.otherConfig.workspacePath)
            : undefined;
    }

    private toJson() {
        return JSON.stringify(this.authProvider.toJSON());
    }

    private static async importOldConfig(
        config: any
    ): Promise<ProfileAuthProvider> {
        const sdkConfig = new Config({
            profile: config.profile,
            configFile:
                workspaceConfigs.databrickscfgLocation ??
                process.env.DATABRICKS_CONFIG_FILE,
            env: {},
        });

        await sdkConfig.ensureResolved();

        return new ProfileAuthProvider(
            new URL(sdkConfig.host!),
            sdkConfig.profile!
        );
    }

    private static async fromJson(json: string, databricksCliPath: LocalUri) {
        const config: Record<string, any> = JSON.parse(json);
        if (!config.authType && config.profile) {
            return new ProjectJsonFile(
                await this.importOldConfig(config),
                config
            );
        } else {
            return new ProjectJsonFile(
                AuthProvider.fromJSON(config, databricksCliPath),
                config
            );
        }
    }

    static getFilePath(localProjectRootPath: LocalUri): LocalUri {
        return localProjectRootPath.join(".databricks", "project.json");
    }

    static async load(
        localProjectRootPath: LocalUri,
        databricksCliPath: LocalUri
    ) {
        const databricksYamlPath =
            ProjectJsonFile.getFilePath(localProjectRootPath);
        const rawConfig = await fs.readFile(databricksYamlPath.path, {
            encoding: "utf-8",
        });
        return ProjectJsonFile.fromJson(rawConfig, databricksCliPath);
    }

    async write(localProjectRootPath: LocalUri) {
        const databricksYamlPath =
            ProjectJsonFile.getFilePath(localProjectRootPath);
        await fs.mkdir(path.dirname(databricksYamlPath.path), {
            recursive: true,
        });
        await FileUtils.writeFileIfDiff(databricksYamlPath.uri, this.toJson());
    }
}
