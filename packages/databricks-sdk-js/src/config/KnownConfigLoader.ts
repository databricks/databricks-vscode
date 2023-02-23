import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {Config, ConfigError, Loader} from "./Config";
import {parse} from "ini";

/**
 * Loads configuration from the Databricks config file which is by default
 * in `~/.databrickscfg`.
 */
export class KnownConfigLoader implements Loader {
    public name = "config-file";

    async configure(cfg: Config): Promise<void> {
        const configFile = cfg.configFile || "~/.databrickscfg";

        const configPath = path.resolve(
            configFile.replace(/^~/, process.env.HOME || os.homedir())
        );

        try {
            await fs.stat(configPath);
        } catch (e) {
            cfg.logger.debug(`${configPath} does not exist`);
            return;
        }

        const iniFile = flattenIniObject(
            parse(await fs.readFile(configPath, {encoding: "utf-8"}))
        );

        const profile = cfg.profile || "DEFAULT";
        const hasExplicitProfile = cfg.profile !== undefined;

        if (!iniFile[profile]) {
            if (!hasExplicitProfile) {
                cfg.logger.debug(
                    `resolve: ${configPath} has no ${profile} profile configured`
                );
                return;
            }

            throw new ConfigError(
                `resolve: ${configPath} has no ${profile} profile configured`,
                cfg
            );
        }
        cfg.logger.info(`loading ${profile} profile from ${configPath}`);
        cfg.attributes.resolveFromStringMap(iniFile[profile]);
    }
}

/**
 * The ini library encodes dots as nested objects, which is not what we want.
 * See: https://github.com/npm/ini/issues/22
 *
 * Reduce the nested object back to a flat object by concatenating object keys with a `.`
 */
export function flattenIniObject(obj: {[key: string]: any}): {
    [key: string]: any;
} {
    function _flattenIniObject(
        obj: {
            [key: string]: any;
        },
        topLevel: Array<string> = [],
        resp = {}
    ) {
        const props: Record<string, any> = {};
        for (const key in obj) {
            if (typeof obj[key] === "object") {
                topLevel.push(key);
                resp = {
                    ...resp,
                    ..._flattenIniObject(obj[key], topLevel, resp),
                };
            } else {
                props[key] = obj[key];
            }
        }

        const topLevelName = topLevel.join(".");
        if (topLevelName !== "" && Object.keys(props).length > 0) {
            resp = {...resp, [topLevelName]: props};
        }

        topLevel.pop();
        return resp;
    }

    return _flattenIniObject(obj);
}
