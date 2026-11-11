import { internalCommand } from "../../platform/commands";

/**
 * Whether Databricks AI tools are installed, in either scope. The AI tools
 * feature registers it; the new-project wizard records it (`hasAiTools`).
 */
export const AI_TOOLS_INSTALLED = internalCommand<undefined, boolean>(
    "databricks.aitools.isInstalled",
);
