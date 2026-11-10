import { contextKey } from "../platform/contextKeys";
import { BUNDLE_BUSY } from "./bundle/BundleOperations";
import { HOST_CONTEXT_KEYS } from "./host/contextKeys";

/**
 * Context keys the bootstrap sets: the scope keys, `BUNDLE_BUSY`,
 * which `BundleOperations` declares, and the host's (`kernel/host/`).
 */
export const ACTIVATED = contextKey<boolean>("databricks.context.activated");

/** The Connection scope: a workspace is signed in. Replaces `databricks.context.loggedIn`. */
export const CONNECTED = contextKey<boolean>("databricks.context.connected");

/** The Project scope: a bundle project is active. Replaces `databricks.context.isBundleProject`. */
export const PROJECT = contextKey<boolean>("databricks.context.project");

export const SHELL_CONTEXT_KEYS = [
    ACTIVATED,
    CONNECTED,
    PROJECT,
    BUNDLE_BUSY,
    ...HOST_CONTEXT_KEYS,
];
