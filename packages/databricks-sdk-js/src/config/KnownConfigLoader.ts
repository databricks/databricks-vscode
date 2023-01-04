import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import {Config, ConfigError, Loader} from "./Config";
import {parse} from "ini";

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

        const iniFile = parse(
            await fs.readFile(configPath, {encoding: "utf-8"})
        );

        const profile = cfg.profile || "DEFAULT";
        const hasExplicitProfile = cfg.profile !== undefined;

        if (!iniFile[profile]) {
            if (!hasExplicitProfile) {
                cfg.logger.debug(
                    `resolve: ${configPath} has no ${profile} profile configured`
                );
                return;
            } else {
                throw new ConfigError(
                    `resolve: ${configPath} has no ${profile} profile configured`,
                    cfg
                );
            }
        }
        cfg.logger.info(`loading ${profile} profile from ${configPath}`);
        cfg.attributes.resolveFromStringMap(iniFile[profile]);
    }
}
