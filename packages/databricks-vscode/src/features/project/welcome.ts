import { contextKey } from "../../platform/contextKeys";

export const CONFIGURATION_VIEW_ID = "configurationView";

/**
 * Local discovery has finished: the "Initializing…" welcome gives way. Old
 * name kept. Without a bundle, the sub-project search may still be running.
 */
export const INITIALIZED = contextKey<boolean>("databricks.context.initialized");

/**
 * Where the search for sub-projects is, while no project is open: "searching" until the first
 * search of the folder ends, then "found" or "none" (a failed search too). Empty with a project
 * open or before detection ends. One key, so the welcome texts never mix values set apart.
 */
export const SUB_PROJECT_SEARCH = contextKey<SubProjectSearchKey>(
    "databricks.context.subProjectSearch",
);

export type SubProjectSearchKey = "searching" | "found" | "none" | "";

/**
 * The folder has no root bundle, but folders below it do. Old name, still set
 * for when-clauses outside the extension; the welcome texts read
 * `SUB_PROJECT_SEARCH`, which says this and whether the search has ended.
 */
export const SUB_PROJECTS_AVAILABLE = contextKey<boolean>(
    "databricks.context.subProjectsAvailable",
);

/** The project has a target: the bundle views show. Old name kept. */
export const TARGET_SET = contextKey<boolean>("databricks.context.bundle.isTargetSet");

/**
 * The folder has an old `.databricks/project.json` and no bundle: the
 * legacy-project notice shows (SHELL-07). Replaces
 * `databricks.context.pendingManualMigration`; nothing is migrated.
 */
export const LEGACY_PROJECT = contextKey<boolean>("databricks.context.legacyProject");
