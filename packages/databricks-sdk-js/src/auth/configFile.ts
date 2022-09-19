import path from "node:path";
import {readFile, stat} from "node:fs/promises";
import {parse} from "ini";
import {homedir} from "node:os";

export type Profiles = Record<
    string,
    {
        host: URL;
        token: string;
    }
>;

export class ConfigFileError extends Error {}

export function resolveConfigFilePath(filePath?: string): string {
    if (!filePath) {
        if (process.env.DATABRICKS_CONFIG_FILE) {
            filePath = process.env.DATABRICKS_CONFIG_FILE;
        } else {
            filePath = path.join(homedir(), ".databrickscfg");
        }
    }

    return filePath;
}

export async function loadConfigFile(filePath?: string): Promise<Profiles> {
    filePath = resolveConfigFilePath(filePath);

    let fileContents: string;
    try {
        await stat(filePath);
        fileContents = await readFile(filePath, {encoding: "utf-8"});
    } catch (e) {
        throw new ConfigFileError(`Can't find ${filePath}`);
    }

    let config: any;
    let profiles: Profiles = {};
    try {
        config = parse(fileContents);
        for (let profile in config) {
            profiles[profile] = {
                host: new URL(config[profile].host),
                token: config[profile].token,
            };
        }
    } catch (e: unknown) {
        let message;
        if (e instanceof Error) {
            message = `${e.name}: ${e.message}`;
        } else {
            message = e;
        }
        throw new ConfigFileError(`Can't parse ${filePath}: ${message}`);
    }

    return profiles;
}
