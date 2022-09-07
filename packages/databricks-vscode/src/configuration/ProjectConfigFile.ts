import path from "node:path";
import fs from "node:fs/promises";

export interface ProjectConfig {
    profile?: string;
    clusterId?: string;
    workspacePath?: string;
}

export class ConfigFileError extends Error {}

export class ProjectConfigFile {
    constructor(public config: ProjectConfig, readonly rootPath?: string) {}

    set profile(profile: string | undefined) {
        this.config.profile = profile;
    }

    set clusterId(clusterId: string | undefined) {
        this.config.clusterId = clusterId;
    }

    set workspacePath(workspacePath: string | undefined) {
        this.config.workspacePath = workspacePath;
    }

    async write() {
        try {
            const originalConfig = await ProjectConfigFile.load(this.rootPath);
            if (
                JSON.stringify(originalConfig.config, null, 2) ===
                JSON.stringify(this.config, null, 2)
            ) {
                return;
            }
        } catch (e) {}

        let fileName = ProjectConfigFile.getProjectConfigFilePath(
            this.rootPath
        );
        await fs.mkdir(path.dirname(fileName), {recursive: true});

        await fs.writeFile(fileName, JSON.stringify(this.config, null, 2), {
            encoding: "utf-8",
        });
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

        let config;
        try {
            config = JSON.parse(rawConfig);
        } catch (e) {
            throw new ConfigFileError("Error parsing project config file");
        }

        return new ProjectConfigFile(config);
    }

    static getProjectConfigFilePath(rootPath?: string): string {
        if (!rootPath) {
            throw new Error("Not in a VSCode workspace");
        }
        let cwd = path.normalize(rootPath);
        return path.join(cwd, ".databricks", "project.json");
    }
}
