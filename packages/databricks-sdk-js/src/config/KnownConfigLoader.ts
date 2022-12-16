import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {AttributeName, Config, CONFIG_FILE_FIELD_NAMES, Loader} from "./Config";
import {parse} from "ini";

export class KnownConfigLoader implements Loader {
    public name = "config-file";

    async configure(cfg: Config): Promise<void> {
        const configFile = cfg.configFile || "~/.databrickscfg";

        const configPath = path.resolve(configFile.replace(/~/, os.homedir()));

        try {
            await fs.stat(configPath);
        } catch (e) {
            cfg.logger.debug(`${configPath} does not exist`);
            return;
        }

        const iniFile = parse(
            await fs.readFile(configPath, {encoding: "utf-8"})
        );

        const profile = cfg.profile || "DEFAULT";
        if (!iniFile[profile]) {
            cfg.logger.debug(
                `${configPath} has no ${profile} profile configured`
            );
            return;
        }
        cfg.logger.info(`loading ${profile} profile from ${configPath}`);

        for (const key of Object.keys(CONFIG_FILE_FIELD_NAMES)) {
            if (iniFile[profile][key]) {
                cfg.setAttribute(key as AttributeName, iniFile[profile][key]);
            }
        }

        cfg.profile = undefined;
        cfg.configFile = undefined;
    }
}
