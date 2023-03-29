/* eslint-disable @typescript-eslint/naming-convention */
import {AttributeName, Config, ConfigError, Loader} from "./Config";

const ATTRIBUTES = new WeakMap();

export function getAttributesFromDecorators(
    target: any,
    config: Config
): ConfigAttributes {
    const attributes = new ConfigAttributes(config);

    if (!ATTRIBUTES.get(target)) {
        return attributes;
    }
    ATTRIBUTES.get(target).map((f: any) => attributes.add(f(config)));
    return attributes;
}

/**
 * Decorator to annotate config attributes
 */
export function attribute(options: {
    name?: string;
    env?: string;
    auth?: "pat" | "basic" | "azure" | "google" | "local-metadata-service";
    sensitive?: boolean;
}) {
    return (target: any, propertyKey: AttributeName) => {
        if (!ATTRIBUTES.get(target)) {
            ATTRIBUTES.set(target, []);
        }
        ATTRIBUTES.get(target).push((config: Config) => {
            return new ConfigAttribute(
                {
                    name: propertyKey,
                    envVar: options.env,
                    confName: options.name,
                    auth: options.auth,
                    sensitive: !!options.sensitive,
                },
                config
            );
        });
    };
}

/**
 * ConfigAttribute provides generic way to work with Config configuration
 * attributes and parses `name`, `env`, and `auth` field tags.
 */
export class ConfigAttribute {
    name: AttributeName;
    envVar?: string;
    confName?: string;
    auth?: string | undefined;
    sensitive: boolean;
    internal: boolean;

    constructor(
        options: {
            name: AttributeName;
            envVar?: string;
            confName?: string;
            auth?: string | undefined;
            sensitive?: boolean;
            internal?: boolean;
        },
        private config: Config
    ) {
        this.name = options.name;
        this.envVar = options.envVar;
        this.confName = options.confName;
        this.auth = options.auth;
        this.sensitive = options.sensitive || false;
        this.internal = options.internal || false;
    }

    isUndefined(): boolean {
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
        return cfg.attributes.resolveFromEnv();
    }
}

export class ConfigAttributes {
    readonly attributes: ConfigAttribute[];

    constructor(private config: Config) {
        this.attributes = [];
        // this.attributes = Object.keys(AUTH_TYPE_FOR_CONFIG).map((key) => {
        //     return new ConfigAttribute(key as AttributeName, config);
        // });
    }

    add(attr: ConfigAttribute): void {
        this.attributes.push(attr);
    }

    validate(): void {
        if (this.config.authType !== undefined) {
            return;
        }

        const authsUsed = new Set<string>();
        for (const attr of this.attributes) {
            if (attr.isUndefined()) {
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

    public resolveFromEnv() {
        for (const attr of this.attributes) {
            if (!attr.isUndefined()) {
                // don't overwrite a value previously set
                continue;
            }

            const env = attr.readEnv();
            if (env !== undefined) {
                (this.config as any)[attr.name] = env;
            }
        }
    }

    public resolveFromStringMap(map: Record<string, string>): void {
        for (const attr of this.attributes) {
            if (!attr.isUndefined()) {
                // don't overwrite a value previously set
                continue;
            }

            if (!attr.confName) {
                continue;
            }

            const value = map[attr.confName];
            if (value !== undefined) {
                (this.config as any)[attr.name] = value;
            }
        }
    }

    debugString(): string {
        const attrUsed: Record<string, string> = {};
        const envUsed: Array<string> = [];

        let result = "";

        for (const attr of this.attributes) {
            if (attr.isUndefined()) {
                continue;
            }

            if (attr.confName) {
                attrUsed[attr.confName] = attr.sensitive
                    ? "***"
                    : (this.config[attr.name] as string);
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
