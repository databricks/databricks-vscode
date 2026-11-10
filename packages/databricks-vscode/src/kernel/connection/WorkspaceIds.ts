import { stateKey, type StateStore } from "../../platform/state";
import { hostKey, isDatabricksDomain } from "./hostMatching";

/**
 * The workspace IDs local windows saw each host serve, when neither the
 * host's URL nor the profile named one: `x-databricks-org-id` on the
 * connection's responses. Global state lives on the laptop, so session
 * windows read what local windows wrote: their target guard matches a
 * unified host that names no workspace by it.
 * Sessions never write it. Kept as a list, because the hosts it is for may
 * serve another workspace to another profile.
 */
export const WORKSPACE_IDS_BY_HOST = stateKey<Record<string, string[]>>(
    "databricks.connection.workspaceIdsByHost",
    "global",
    {},
);

/** Enough for the profiles of one user; older IDs of a host go first. */
const MAX_IDS_PER_HOST = 10;

export class WorkspaceIdLedger {
    constructor(private readonly state: StateStore) {}

    /** Records that `host` served `workspaceId`; only Databricks domains are recorded. */
    async record(host: string, workspaceId: string): Promise<void> {
        const key = hostKey(host);
        if (key === undefined || !isDatabricksDomain(key)) {
            return;
        }
        const all = this.state.get(WORKSPACE_IDS_BY_HOST);
        const ids = all[key] ?? [];
        if (ids.at(-1) === workspaceId) {
            return;
        }
        const next = [...ids.filter((id) => id !== workspaceId), workspaceId].slice(
            -MAX_IDS_PER_HOST,
        );
        await this.state.set(WORKSPACE_IDS_BY_HOST, { ...all, [key]: next });
    }

    /** Host → the workspace IDs it served. */
    read(): ReadonlyMap<string, readonly string[]> {
        return new Map(Object.entries(this.state.get(WORKSPACE_IDS_BY_HOST)));
    }
}
