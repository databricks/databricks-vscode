import {ApiClient, CancellationToken, WorkspaceConfService} from "..";
import {Context} from "../context";

type StringBool = "true" | "false" | "";

/**
 * Partial list of workspace conf properties.
 */
export interface WorkspaceConfProps {
    /**
     * Enable or disable Repos. You should see a new Repos icon in your workspace's left navigation when this feature is enabled.
     */
    enableProjectTypeInWorkspace: StringBool;

    /**
     * Enable or disable the Files in Repos feature.
     *
     * When Files in Repos is set to 'DBR 8.4+', arbitrary files will be
     * included in Repo operations and can be accessed from clusters
     * running DBR 8.4 and above.
     *
     * When Files in Repos is set to 'DBR 11.0+', arbitrary files will be
     * included in Repo operations and can be accessed from clusters
     * running DBR 11.0 and above.
     *
     * When Files in Repos is disabled, arbitrary files will not be included
     * in Repo operations and cannot be accessed from clusters.
     */
    enableWorkspaceFilesystem: "dbr8.4+" | "dbr11.0+" | "false" | "true";
}

/**
 * Types interface to the workspace conf service.
 *
 * This class provides strong typing for a subset of the workspace conf
 * properties.
 *
 * In order to set arbitrary properties use the API wrapper directly.
 */
export class WorkspaceConf {
    constructor(private readonly client: ApiClient) {}

    async getStatus(
        keys: Array<keyof WorkspaceConfProps>,
        cancellationToken?: CancellationToken
    ): Promise<Partial<WorkspaceConfProps>> {
        let wsConfApi = new WorkspaceConfService(this.client);
        return await wsConfApi.getStatus(
            {
                keys: keys.join(","),
            },
            new Context({cancellationToken})
        );
    }

    async setStatus(
        request: Partial<WorkspaceConfProps>,
        cancellationToken?: CancellationToken
    ): Promise<Partial<WorkspaceConfProps>> {
        let wsConfApi = new WorkspaceConfService(this.client);
        return await wsConfApi.setStatus(
            request,
            new Context({cancellationToken})
        );
    }
}
