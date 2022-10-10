import path from "node:path";
import {readFile, stat} from "node:fs/promises";
import {parse} from "ini";
import {homedir} from "node:os";
import {defaultRedactor} from "../Redactor";

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

function getProfile(config: any) {
    return {
        host: new URL(config.host),
        token: config.token,
    };
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
    let defaultSection: Record<string, any> = {};
    let defaultSectionFound = false;
    try {
        config = parse(fileContents);
        for (let key in config) {
            if (key === "DEFAULT") {
                for (let defaultSectionKey in config[key]) {
                    defaultSection[defaultSectionKey] =
                        config[key][defaultSectionKey];
                }
                defaultSectionFound = true;
                continue;
            }
            // for global values without a section header
            // put them in the default sections
            if (typeof config[key] === "string") {
                defaultSection[key] = config[key];
                defaultSectionFound = true;
                continue;
            }
            profiles[key] = getProfile(config[key]);
        }
        if (defaultSectionFound) {
            profiles["DEFAULT"] = getProfile(defaultSection);
        }
    } catch (e: unknown) {
        let message;
        if (e instanceof Error) {
            message = `${e.name}: ${e.message}`;
        } else {
            message = e;
        }
        throw new ConfigFileError(`${message}`);
    }

    return profiles;
}
