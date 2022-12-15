/* eslint-disable @typescript-eslint/naming-convention */
import {Config, ConfigOptions, ENV_TO_CONFIG, Loader} from "./Config";

export class ConfigAttributes implements Loader {
    public name = "environment";

    async configure(cfg: Config): Promise<void> {
        for (const [env, config] of Object.entries(ENV_TO_CONFIG)) {
            if (process.env[env] !== undefined) {
                cfg.setAttribute(
                    config as keyof ConfigOptions,
                    process.env[env]!
                );
            }
        }
    }
}
