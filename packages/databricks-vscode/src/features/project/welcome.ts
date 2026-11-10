import { contextKey } from "../../platform/contextKeys";

export const CONFIGURATION_VIEW_ID = "configurationView";

/** Local discovery has finished: the "Initializing…" welcome gives way. Old name kept. */
export const INITIALIZED = contextKey<boolean>("databricks.context.initialized");

/** The folder has no root bundle, but folders below it do: "Choose a project". Old name kept. */
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
