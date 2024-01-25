import path from "node:path";
import fs from "node:fs/promises";
import {
    AuthProvider,
    ProfileAuthProvider,
} from "../configuration/auth/AuthProvider";
import {Uri} from "vscode";
import {Config} from "@databricks/databricks-sdk";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";

export interface ProjectConfig {
    authProvider: AuthProvider;
    clusterId?: string;
    workspacePath?: Uri;
}

export class ConfigFileError extends Error {}

export class ProjectConfigFile {
    constructor(
        private config: ProjectConfig,
        readonly rootPath: string,
        readonly cliPath: string
    ) {}

    get host() {
        return this.config.authProvider.host;
    }

    get authProvider() {
        return this.config.authProvider;
    }

    get clusterId() {
        return this.config.clusterId;
    }

    get workspacePath(): Uri | undefined {
        return this.config.workspacePath;
    }

    toJSON(): Record<string, unknown> {
        return {
            ...this.config.authProvider.toJSON(),
            clusterId: this.clusterId,
            workspacePath: this.workspacePath?.path,
        };
    }

    static async importOldConfig(config: any): Promise<ProfileAuthProvider> {
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

    static async load(
        rootPath: string,
        cliPath: string
    ): Promise<ProjectConfigFile | undefined> {
        const projectConfigFilePath = path.join(
            path.normalize(rootPath),
            ".databricks",
            "project.json"
        );

        let rawConfig;
        try {
            rawConfig = await fs.readFile(projectConfigFilePath, {
                encoding: "utf-8",
            });
        } catch (error: any) {
            if (error?.code === "ENOENT") {
                return undefined;
            } else {
                throw error;
            }
        }

        let authProvider: AuthProvider;
        const config = JSON.parse(rawConfig);
        if (!config.authType && config.profile) {
            authProvider = await this.importOldConfig(config);
        } else {
            authProvider = AuthProvider.fromJSON(config, cliPath);
        }
        return new ProjectConfigFile(
            {
                authProvider: authProvider!,
                clusterId: config.clusterId,
                workspacePath:
                    config.workspacePath !== undefined
                        ? Uri.from({
                              scheme: "wsfs",
                              path: config.workspacePath,
                          })
                        : undefined,
            },
            rootPath,
            cliPath
        );
    }
}
