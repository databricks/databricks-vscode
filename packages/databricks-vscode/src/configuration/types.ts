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

export const AUTHENTICATED_BUNDLE_CONFIG = [
    "clusterId",
    "workspaceFsPath",
] as const;

/** These are configs which can be loaded from the bundle */
export type AuthenticatedBundleConfig = Pick<
    DatabricksConfig,
    (typeof AUTHENTICATED_BUNDLE_CONFIG)[number]
>;

export const DATABRICKS_CONFIG_KEYS: (keyof DatabricksConfig)[] = Array.from(
    new Set([
        ...OVERRIDEABLE_CONFIG_KEYS,
        ...BUNDLE_FILE_CONFIG_KEYS,
        ...AUTHENTICATED_BUNDLE_CONFIG,
    ])
);

export function isOverrideableConfigKey(
    key: any
): key is keyof OverrideableConfig {
    return OVERRIDEABLE_CONFIG_KEYS.includes(key);
}

export function isBundleConfigKey(key: any): key is keyof BundleFileConfig {
    return BUNDLE_FILE_CONFIG_KEYS.includes(key);
}

export function isAuthenticatedBundleConfigKey(
    key: any
): key is keyof AuthenticatedBundleConfig {
    return AUTHENTICATED_BUNDLE_CONFIG.includes(key);
}
