export type DatabricksConfig = {
    host?: string;

    mode?: "development" | "staging" | "production";
    authParams?: Record<string, any>;

    clusterId?: string;
    workspaceFsPath?: string;
};

export type DatabricksConfigSource = "bundle" | "override" | "default";

export type DatabricksConfigSourceMap = {
    [key in keyof DatabricksConfig]: DatabricksConfigSource;
};

export const OVERRIDEABLE_CONFIG_KEYS = ["clusterId", "authParams"] as const;

export type OverrideableConfig = Pick<
    DatabricksConfig,
    (typeof OVERRIDEABLE_CONFIG_KEYS)[number]
>;

export const BUNDLE_FILE_CONFIG_KEYS = ["authParams", "mode", "host"] as const;

/** These are configs which can be loaded from the bundle */
export type BundleFileConfig = Pick<
    DatabricksConfig,
    (typeof BUNDLE_FILE_CONFIG_KEYS)[number]
>;

export const DATABRICKS_CONFIG_KEYS = Array.from(
    new Set([...OVERRIDEABLE_CONFIG_KEYS, ...BUNDLE_FILE_CONFIG_KEYS])
);

export function isOverrideableConfigKey(
    key: any
): key is keyof OverrideableConfig {
    return OVERRIDEABLE_CONFIG_KEYS.includes(key);
}

export function isBundleConfigKey(key: any): key is keyof BundleFileConfig {
    return BUNDLE_FILE_CONFIG_KEYS.includes(key);
}

export interface ConfigReaderWriter<T extends keyof DatabricksConfig> {
    readAll(target: string): Promise<DatabricksConfig | undefined>;
    write(key: T, target: string, value?: DatabricksConfig[T]): Promise<void>;
}
