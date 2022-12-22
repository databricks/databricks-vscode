import path from "node:path";
import fs from "node:fs/promises";
import {AuthProvider, ProfileAuthProvider} from "./AuthProvider";
import {fromConfigFile} from "@databricks/databricks-sdk";
import {Uri} from "vscode";
import {NamedLogger} from "@databricks/databricks-sdk/dist/logging";
import {Loggers} from "../logger";

export interface ProjectConfig {
    authProvider: AuthProvider;
    clusterId?: string;
    workspacePath?: Uri;
}

export class ConfigFileError extends Error {}

export class ProjectConfigFile {
    constructor(private config: ProjectConfig, readonly rootPath?: string) {}

    get host() {
        return this.config.authProvider.host;
    }

    get authProvider() {
        return this.config.authProvider;
    }

    get clusterId() {
        return this.config.clusterId;
    }

    set clusterId(clusterId: string | undefined) {
        this.config.clusterId = clusterId;
    }

    get workspacePath(): Uri | undefined {
        return this.config.workspacePath;
    }

    set workspacePath(workspacePath: Uri | undefined) {
        this.config.workspacePath = workspacePath;
    }

    toJSON(): Record<string, unknown> {
        return {
            ...this.config.authProvider.toJSON(),
            clusterId: this.clusterId,
            workspacePath: this.workspacePath?.path,
        };
    }

    async write() {
        try {
            const originalConfig = await ProjectConfigFile.load(this.rootPath);
            if (
                JSON.stringify(originalConfig, null, 2) ===
                JSON.stringify(this, null, 2)
            ) {
                return;
            }
        } catch (e) {}

        const fileName = ProjectConfigFile.getProjectConfigFilePath(
            this.rootPath
        );
        await fs.mkdir(path.dirname(fileName), {recursive: true});

        await fs.writeFile(fileName, JSON.stringify(this, null, 2), {
            encoding: "utf-8",
        });
    }

    static async importOldConfig(config: any): Promise<ProfileAuthProvider> {
        const credentialProvider = fromConfigFile(config.profile);
        const creds = await credentialProvider();

        return new ProfileAuthProvider(creds.host, config.profile);
    }

    static async load(rootPath?: string): Promise<ProjectConfigFile> {
        const projectConfigFilePath = this.getProjectConfigFilePath(rootPath);

        let rawConfig;
        try {
            rawConfig = await fs.readFile(projectConfigFilePath, {
                encoding: "utf-8",
            });
        } catch (e: any) {
            if (e.code && e.code === "ENOENT") {
                throw new ConfigFileError(
                    `Project config file does not exist: ${projectConfigFilePath}`
                );
            } else {
                throw e;
            }
        }

        let authProvider: AuthProvider;
        let config: any;
        try {
            config = JSON.parse(rawConfig);
            if (!config.authType && config.profile) {
                authProvider = await this.importOldConfig(config);
            } else {
                authProvider = AuthProvider.fromJSON(config);
            }
        } catch (e) {
            NamedLogger.getOrCreate(Loggers.Extension).error(
                "Error parsing project config file",
                e
            );
            throw new ConfigFileError("Error parsing project config file");
        }
        return new ProjectConfigFile(
            {
                authProvider: authProvider!,
                clusterId: config.clusterId,
                workspacePath: config.workspacePath,
            },
            rootPath
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
