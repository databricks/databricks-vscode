export type DatabricksConfigs = {
    host?: string;

    // reconcile with actual mode and auth type enums from bundle
    mode?: "dev" | "staging" | "prod";
    authParams?: Record<string, any>;

    clusterId?: string;
    workspaceFsPath?: string;
};

export type DatabricksConfigSource = {
    [key in keyof DatabricksConfigs]: "bundle" | "override";
};

export const OVERRIDEABLE_CONFIGS = [
    "clusterId",
    "authParams",
    "workspaceFsPath",
] as const;

export type OverrideableConfigs = Pick<
    DatabricksConfigs,
    (typeof OVERRIDEABLE_CONFIGS)[number]
>;

export const BUNDLE_CONFIGS = [
    "clusterId",
    "authParams",
    "workspaceFsPath",
    "mode",
    "host",
] as const;

/** These are configs which can be loaded from the bundle */
export type BundleConfigs = Pick<
    DatabricksConfigs,
    (typeof BUNDLE_CONFIGS)[number]
>;

export const DATABRICKS_CONFIGS = Array.from(
    new Set([...OVERRIDEABLE_CONFIGS, ...BUNDLE_CONFIGS])
);

export function isOverrideableConfig(
    key: any
): key is keyof OverrideableConfigs {
    return OVERRIDEABLE_CONFIGS.includes(key);
}

export function isBundleConfig(key: any): key is keyof BundleConfigs {
    return BUNDLE_CONFIGS.includes(key);
}

export interface ConfigReaderWriter<T extends keyof DatabricksConfigs> {
    read(key: T, target: string): Promise<DatabricksConfigs[T] | undefined>;
    write(key: T, target: string, value?: DatabricksConfigs[T]): Promise<void>;
}
