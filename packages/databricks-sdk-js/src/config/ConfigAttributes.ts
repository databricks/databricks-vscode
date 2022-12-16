/* eslint-disable @typescript-eslint/naming-convention */
import {
    AttributeName,
    AuthType,
    AUTH_TYPE_FOR_CONFIG,
    Config,
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
    auth?: AuthType | undefined;
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

    constructor(private attributes: ConfigAttributes) {}

    async configure(cfg: Config): Promise<void> {
        for (const attr of this.attributes) {
            const env = attr.readEnv();
            if (env !== undefined) {
                cfg[attr.name] = env;
            }
        }
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

        const authsUsed = new Set<AuthType>();
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
        throw new Error(
            `validate: more than one authorization method configured: ${sortedMethods.join(
                " and "
            )}`
        );
    }

    debugString(): string {
        const attrUsed: Record<string, string> = {};
        const envUsed: Record<string, string> = {};

        let result = "";

        for (const attr of this.attributes) {
            if (attr.isZero()) {
                continue;
            }

            attrUsed[attr.name] = attr.sensitive
                ? "***"
                : this.config[attr.name]!;
            if (attr.envVar) {
                envUsed[attr.envVar] = attr.sensitive ? "***" : attr.readEnv()!;
            }
        }
        if (Object.keys(attrUsed).length > 0) {
            result += `Config: ${Object.keys(attrUsed)
                .map((key) => `${key}=${attrUsed[key]}`)
                .join(", ")}`;
        }

        if (Object.keys(envUsed).length > 0) {
            result += `Env: ${Object.keys(envUsed)
                .map((key) => `${key}=${envUsed[key]}`)
                .join(", ")}`;
        }

        return result;
    }

    *[Symbol.iterator]() {
        yield* this.attributes;
    }
}
