import { stateKey } from "../../platform/state";

/** The version that ran last; undefined on a fresh install. */
export const LAST_INSTALLED_VERSION = stateKey<string | undefined>(
    "databricks.lastInstalledExtensionVersion",
    "global",
    undefined,
);
