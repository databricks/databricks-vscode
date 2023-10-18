export interface BundleTarget {
    name: string;
    // reconcile with actual bundle mode strings
    mode: "dev" | "staging" | "prod";
}

export interface OverrideableConfigs {
    clusterId?: string;
    authType?: string;
    workspaceFsPath?: string;
}
