import {RemoteUri} from "../sync/SyncDestination";

export type DatabricksConfigs = {
    host?: string;

    // reconcile with actual mode and auth type enums from bundle
    mode?: "dev" | "staging" | "prod";
    authType?: string;

    clusterId?: string;
    workspaceFsPath?: RemoteUri;
};

export const OVERRIDEABLE_CONFIGS = [
    "clusterId",
    "authType",
    "workspaceFsPath",
] as const;

export type OverrideableConfigs = Pick<
    DatabricksConfigs,
    (typeof OVERRIDEABLE_CONFIGS)[number]
>;

export const BUNDLE_CONFIGS = [
    "clusterId",
    "authType",
    "workspaceFsPath",
    "mode",
    "host",
] as const;

/** These are configs which can be loaded from the bundle */
export type BundleConfigs = Pick<
    DatabricksConfigs,
    (typeof BUNDLE_CONFIGS)[number]
>;

export function isOverrideableConfig(
    key: any
): key is keyof OverrideableConfigs {
    return OVERRIDEABLE_CONFIGS.includes(key);
}

export function isBundleConfig(key: any): key is keyof BundleConfigs {
    return BUNDLE_CONFIGS.includes(key);
}
