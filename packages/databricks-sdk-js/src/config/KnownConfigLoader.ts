import path from "node:path";
import fs from "node:fs/promises";
import {Config, ConfigOptions, CONFIG_FILE_VALUES, Loader} from "./Config";
import {parse} from "ini";

export class KnownConfigLoader implements Loader {
    public name = "config-file";

    async configure(cfg: Config): Promise<void> {
        const configFile = cfg.configFile || "~/.databrickscfg";

        const configPath = path.resolve(configFile);
        if (!(await fs.stat(configPath))) {
            cfg.logger.debug(`${configPath} does not exist`);
            return;
        }

        const iniFile = parse(
            await fs.readFile(configFile, {encoding: "utf-8"})
        );

        const profile = cfg.profile || "DEFAULT";
        if (!iniFile[profile]) {
            cfg.logger.debug(
                `${configPath} has no ${profile} profile configured`
            );
            return;
        }
        cfg.logger.info(`loading ${profile} profile from ${configPath}`);

        for (const key of Object.keys(CONFIG_FILE_VALUES)) {
            if (iniFile[profile][key]) {
                cfg.setAttribute(
                    key as keyof ConfigOptions,
                    iniFile[profile][key]
                );
            }
        }

        cfg.profile = undefined;
        cfg.configFile = undefined;
    }
}
