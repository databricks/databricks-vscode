import { internalCommand } from "../../platform/commands";

/**
 * Compute commands other features run. The compute feature registers them.
 */

/** What the compute picker chose; Serverless has a version only when one was asked for. */
export type SelectedCompute =
    | { readonly kind: "cluster"; readonly clusterId: string }
    | { readonly kind: "serverless"; readonly version?: string };

/**
 * "Databricks: Configure compute" (COMP-01). Resolves when the picker
 * closes, to what was chosen and saved, or undefined when it was dismissed
 * or "Create New Cluster" was picked. The Python setup runs it with
 * its own title. Also contributed, so the palette and the Cluster row run it
 * with no argument or a row.
 */
export const ATTACH_CLUSTER_QUICK_PICK = internalCommand<
    string | undefined,
    SelectedCompute | undefined
>("databricks.connection.attachClusterQuickPick");

/**
 * "Start Cluster" (COMP-05). With no argument it starts the attached
 * cluster, as the run prompts' "Start Cluster" does (RUN-01), in a local
 * window. A session window has no attached cluster to name without a row, so
 * it fails there: the Compute view passes the row.
 */
export const START_CLUSTER = internalCommand<undefined, void>("databricks.cluster.start");

/**
 * Asks for the serverless environment version (COMP-02), with the picker
 * "Configure compute" shows, and saves it with Serverless selected. Resolves
 * to the bare version, or undefined when dismissed (nothing is saved). The
 * Python setup runs it when serverless is selected without one.
 */
export const SELECT_SERVERLESS_VERSION = internalCommand<undefined, string | undefined>(
    "databricks.compute.selectServerlessVersion",
);
