import path = require("node:path");
import fs = require("node:fs/promises");

export interface ProjectConfig {
    profile?: string;
    clusterId?: string;
    workspacePath?: string;
}

export class ConfigFileError extends Error {}

export class ProjectConfigFile {
    constructor(public config: ProjectConfig, private projectDir: string) {}

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
        let fileName = ProjectConfigFile.getProjectConfigFilePath(
            this.projectDir
        );
        await fs.mkdir(path.dirname(fileName), {recursive: true});

        fs.writeFile(fileName, JSON.stringify(this.config, null, 2), {
            encoding: "utf-8",
        });
    }

    static async load(projectDir: string): Promise<ProjectConfigFile> {
        const projectConfigFilePath = this.getProjectConfigFilePath(projectDir);

        let rawConfig;
        try {
            rawConfig = await fs.readFile(projectConfigFilePath, {
                encoding: "utf-8",
            });
        } catch (e: any) {
            if (e.code && e.code === "ENOENT") {
                throw new ConfigFileError("Project config file does not exist");
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

        return new ProjectConfigFile(config, projectDir);
    }

    private static getProjectConfigFilePath(projectDir: string): string {
        let cwd = path.normalize(projectDir);
        return path.join(cwd, ".databricks", "project.json");
    }
}
