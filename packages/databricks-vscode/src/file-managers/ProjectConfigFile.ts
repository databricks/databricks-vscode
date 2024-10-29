import path from "node:path";
import fs from "node:fs/promises";
import {
    AuthProvider,
    ProfileAuthProvider,
} from "../configuration/auth/AuthProvider";
import {Uri} from "vscode";
import {CliWrapper} from "../cli/CliWrapper";

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

    static async importOldConfig(
        config: any,
        cli: CliWrapper
    ): Promise<ProfileAuthProvider> {
        return await ProfileAuthProvider.from(config.profile, cli);
    }

    static async loadConfig(
        rootPath: string
    ): Promise<Record<string, any> | undefined> {
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
        return JSON.parse(rawConfig);
    }

    static async load(
        rootPath: string,
        cli: CliWrapper
    ): Promise<ProjectConfigFile | undefined> {
        const config = await ProjectConfigFile.loadConfig(rootPath);
        if (!config) {
            return undefined;
        }
        let authProvider: AuthProvider;
        if (!config.authType && config.profile) {
            authProvider = await this.importOldConfig(config, cli);
        } else {
            authProvider = AuthProvider.fromJSON(config, cli);
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
            cli.cliPath
        );
    }

    static getProjectConfigFilePath(rootPath?: string): string {
        if (!rootPath) {
            throw new Error("Not in a VSCode workspace");
        }
        const cwd = path.normalize(rootPath);
        return path.join(cwd, ".databricks", "project.json");
    }
}
