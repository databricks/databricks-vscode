export type DatabricksConfig = {
    host?: string;

    mode?: "development" | "staging" | "production";
    authProfile?: string;

    clusterId?: string;
    workspaceFsPath?: string;
};

export type DatabricksConfigSource = "bundle" | "override" | "default";

export type DatabricksConfigSourceMap = {
    [key in keyof DatabricksConfig]: DatabricksConfigSource;
};

export const OVERRIDEABLE_CONFIG_KEYS = ["clusterId", "authProfile"] as const;

export type OverrideableConfig = Pick<
    DatabricksConfig,
    (typeof OVERRIDEABLE_CONFIG_KEYS)[number]
>;

export const BUNDLE_PRE_VALIDATE_CONFIG_KEYS = [
    "authProfile",
    "mode",
    "host",
] as const;

/** These are configs which can be loaded from the bundle */
export type BundlePreValidateConfig = Pick<
    DatabricksConfig,
    (typeof BUNDLE_PRE_VALIDATE_CONFIG_KEYS)[number]
>;

export const BUNDLE_VALIDATE_CONFIG_KEYS = [
    "clusterId",
    "workspaceFsPath",
] as const;

/** These are configs which can be loaded from the bundle */
export type BundleValidateConfig = Pick<
    DatabricksConfig,
    (typeof BUNDLE_VALIDATE_CONFIG_KEYS)[number]
>;

export const DATABRICKS_CONFIG_KEYS: (keyof DatabricksConfig)[] = Array.from(
    new Set([
        ...OVERRIDEABLE_CONFIG_KEYS,
        ...BUNDLE_PRE_VALIDATE_CONFIG_KEYS,
        ...BUNDLE_VALIDATE_CONFIG_KEYS,
    ])
);

export function isOverrideableConfigKey(
    key: any
): key is keyof OverrideableConfig {
    return OVERRIDEABLE_CONFIG_KEYS.includes(key);
}

export function isBundlePreValidateConfigKey(
    key: any
): key is keyof BundlePreValidateConfig {
    return BUNDLE_PRE_VALIDATE_CONFIG_KEYS.includes(key);
}

export function isBundleValidateConfigKey(
    key: any
): key is keyof BundleValidateConfig {
    return BUNDLE_VALIDATE_CONFIG_KEYS.includes(key);
}
