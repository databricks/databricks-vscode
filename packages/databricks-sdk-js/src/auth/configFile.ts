import path from "node:path";
import {readFile, stat} from "node:fs/promises";
import {parse} from "ini";
import {homedir} from "node:os";
import {Profile, Profiles, WithError} from "./types";

export class ConfigFileError extends Error {}
export class ConfigFileProfileParsingError extends Error {
    constructor(name?: string, message?: string) {
        super(message);
        this.name = name ?? "";
    }
}

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

function getProfile(config: any): Profile {
    if (config.host === undefined) {
        throw new ConfigFileProfileParsingError(
            "HostParsingError",
            '"host" it not defined'
        );
    }

    let host;
    try {
        host = new URL(config.host);
    } catch (e: unknown) {
        if (typeof e === "string") {
            throw new ConfigFileProfileParsingError("HostParsingError", e);
        } else if (e instanceof Error) {
            throw new ConfigFileProfileParsingError(
                "HostParsingError",
                `${e.name}: ${e.message}`
            );
        }
        throw e;
    }

    if (config.token === undefined) {
        throw new ConfigFileProfileParsingError(
            "TokenParsingError",
            '"token" it not defined'
        );
    }
    return {
        host: host,
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
            profiles[key] = WithError.fromTry<
                Profile,
                ConfigFileProfileParsingError
            >(() => getProfile(config[key]));
        }
        if (defaultSectionFound) {
            profiles["DEFAULT"] = WithError.fromTry<
                Profile,
                ConfigFileProfileParsingError
            >(() => getProfile(defaultSection));
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
