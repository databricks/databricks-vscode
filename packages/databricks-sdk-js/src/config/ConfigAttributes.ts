/* eslint-disable @typescript-eslint/naming-convention */
import {
    AttributeName,
    AUTH_TYPE_FOR_CONFIG,
    Config,
    ConfigError,
    CONFIG_FILE_FIELD_NAMES,
    ENV_VAR_NAMES,
    Loader,
    SENSISTIVE_FIELDS,
} from "./Config";

/**
 * ConfigAttribute provides generic way to work with Config configuration
 * attributes and parses `name`, `env`, and `auth` field tags.
 */
export class ConfigAttribute {
    name: keyof typeof AUTH_TYPE_FOR_CONFIG;
    envVar?: string;
    confName?: string;
    auth?: string | undefined;
    sensitive: boolean;
    internal: boolean;
    num: number;

    constructor(name: AttributeName, private config: Config) {
        this.name = name;
        this.envVar = ENV_VAR_NAMES[name];
        this.confName = CONFIG_FILE_FIELD_NAMES[name];
        this.auth = AUTH_TYPE_FOR_CONFIG[name];
        this.sensitive = SENSISTIVE_FIELDS.has(name);
        this.internal = false;
        this.num = 0;
    }

    isZero(): boolean {
        return this.config[this.name] === undefined;
    }

    readEnv(): string | undefined {
        if (this.envVar) {
            return this.config.env[this.envVar];
        }
    }

    readFromConfigFile(conf: Record<string, string>): string | undefined {
        if (this.confName) {
            return conf[this.confName];
        }
    }
}

export class EnvironmentLoader implements Loader {
    public name = "environment";

    async configure(cfg: Config): Promise<void> {
        return cfg.attributes.resolveFromEnv(cfg);
    }
}

export class ConfigAttributes {
    readonly attributes: ConfigAttribute[];

    constructor(private config: Config) {
        this.attributes = Object.keys(AUTH_TYPE_FOR_CONFIG).map((key) => {
            return new ConfigAttribute(key as AttributeName, config);
        });
    }

    validate(): void {
        if (this.config.authType !== undefined) {
            return;
        }

        const authsUsed = new Set<string>();
        for (const attr of this.attributes) {
            if (attr.isZero()) {
                continue;
            }
            if (attr.auth === undefined) {
                continue;
            }
            authsUsed.add(attr.auth);
        }

        if (authsUsed.size <= 1) {
            return;
        }

        const sortedMethods = Array.from(authsUsed).sort();
        throw new ConfigError(
            `validate: more than one authorization method configured: ${sortedMethods.join(
                " and "
            )}`,
            this.config
        );
    }

    public resolveFromEnv(cfg: Config) {
        for (const attr of this.attributes) {
            if (!attr.isZero()) {
                // don't overwtite a value previously set
                continue;
            }

            const env = attr.readEnv();
            if (env !== undefined) {
                cfg[attr.name] = env;
            }
        }
    }

    public resolveFromStringMap(map: Record<string, string>): void {
        for (const attr of this.attributes) {
            if (!attr.isZero()) {
                // don't overwrite a value previously set
                continue;
            }

            if (!attr.confName) {
                continue;
            }

            const value = map[attr.confName];
            if (value !== undefined) {
                this.config[attr.name] = value;
            }
        }
    }

    debugString(): string {
        const attrUsed: Record<string, string> = {};
        const envUsed: Array<string> = [];

        let result = "";

        for (const attr of this.attributes) {
            if (attr.isZero()) {
                continue;
            }

            if (attr.confName) {
                attrUsed[attr.confName] = attr.sensitive
                    ? "***"
                    : this.config[attr.name]!;
            }

            if (attr.envVar) {
                if (attr.readEnv() !== undefined) {
                    envUsed.push(attr.envVar);
                }
            }
        }
        if (Object.keys(attrUsed).length > 0) {
            result += `Config: ${Object.keys(attrUsed)
                .map((key) => `${key}=${attrUsed[key]}`)
                .join(", ")}`;
        }

        if (Object.keys(envUsed).length > 0) {
            result += `. Env: ${envUsed.join(", ")}`;
        }

        return result;
    }

    *[Symbol.iterator]() {
        yield* this.attributes;
    }
}
