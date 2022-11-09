import path from "node:path";
import {readFile, stat} from "node:fs/promises";
import {parse} from "ini";
import {homedir} from "node:os";

export class ConfigFileError extends Error {}
export class ConfigFileProfileParsingError extends Error {
    constructor(name?: string, message?: string) {
        super(message);
        this.name = name ?? "";
    }
}

export class HostParsingError extends ConfigFileProfileParsingError {
    constructor(message?: string) {
        super("HostParsingError", message);
    }
}

export class TokenParsingError extends ConfigFileProfileParsingError {
    constructor(message?: string) {
        super("TokenParsingError", message);
    }
}

export type Profile = {
    host: URL;
    token: string;
};

export type Profiles = Record<string, Profile | ConfigFileProfileParsingError>;

export function isConfigFileParsingError(
    profileOrError: Profile | ConfigFileProfileParsingError
): profileOrError is ConfigFileProfileParsingError {
    return profileOrError instanceof ConfigFileProfileParsingError;
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

function getProfileOrError(
    config: any
): Profile | ConfigFileProfileParsingError {
    if (config.host === undefined) {
        return new HostParsingError('"host" it not defined');
    }

    let host;
    try {
        host = new URL(config.host);
    } catch (e: unknown) {
        if (typeof e === "string") {
            return new HostParsingError(e);
        } else if (e instanceof Error) {
            return new HostParsingError(`${e.name}: ${e.message}`);
        }
        return new HostParsingError(String(e));
    }

    if (config.token === undefined) {
        return new TokenParsingError('"token" it not defined');
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
    const profiles: Profiles = {};
    const defaultSection: Record<string, any> = {};
    let defaultSectionFound = false;
    try {
        config = parse(fileContents);
        for (const key in config) {
            if (key === "DEFAULT") {
                for (const defaultSectionKey in config[key]) {
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
            profiles[key] = getProfileOrError(config[key]);
        }
        if (defaultSectionFound) {
            profiles["DEFAULT"] = getProfileOrError(defaultSection);
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
