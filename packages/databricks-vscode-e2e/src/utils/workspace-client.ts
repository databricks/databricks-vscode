import { defaultCredentials } from "@databricks/sdk-auth/credentials";
import { ClustersClient, type ClusterInfo } from "@databricks/sdk-clusters/v2";
import { resolve } from "@databricks/sdk-core/profiles";
import { JobsClient, type BaseJob } from "@databricks/sdk-jobs/v2";
import type { ClientOptions } from "@databricks/sdk-options/client";
import { ScimClient } from "@databricks/sdk-scim/v1";

/*
 * The part of `@databricks/sdk-experimental`'s `WorkspaceClient` that the
 * frozen specs use, over the modular SDK, which the rewrite depends on. The
 * SDK reads the profile from the config file and authenticates the way the
 * profile says: a PAT, OAuth M2M, or the CLI.
 */

/** What `workspace.getStatus` returns, as the API sends it. */
export interface WorkspaceObjectInfo {
    path?: string;
    object_type?: string;
    object_id?: number;
    language?: string;
}

/** A pipeline update, as the API sends it. */
export interface PipelineUpdate {
    update_id: string;
    state?: string;
    validate_only?: boolean;
    refresh_selection?: string[];
    full_refresh_selection?: string[];
}

interface Options {
    configFile?: string;
    profile: string;
}

export class WorkspaceClient {
    private readonly options: ClientOptions;

    constructor(options: Options) {
        const configFile = options.configFile ?? process.env.DATABRICKS_CONFIG_FILE;
        if (configFile === undefined) {
            throw new Error("No config file");
        }
        // The profile alone decides: the worker's DATABRICKS_* variables don't.
        this.options = {
            profileOptions: { profile: options.profile, configFile, disableEnv: true },
        };
    }

    readonly currentUser = {
        me: () => new ScimClient(this.options).me({}),
    };

    /**
     * `workspace.*`, as the frozen specs call it. The modular SDK has no
     * workspace package, so this calls the API with the profile's
     * credentials, as the SDK clients do. Errors carry the API's message.
     */
    readonly workspace = {
        getStatus: (request: { path: string }): Promise<WorkspaceObjectInfo> =>
            this.call("GET", "get-status", { path: request.path }),
        mkdirs: async (request: { path: string }): Promise<void> => {
            await this.call("POST", "mkdirs", request);
        },
        import: async (request: {
            path: string;
            format?: string;
            content: string;
            overwrite?: boolean;
            language?: string;
        }): Promise<void> => {
            await this.call("POST", "import", request);
        },
        export: (request: { path: string; format?: string }): Promise<{ content?: string }> =>
            this.call("GET", "export", { path: request.path, format: request.format ?? "SOURCE" }),
        delete: async (request: { path: string; recursive?: boolean }): Promise<void> => {
            await this.call("POST", "delete", request);
        },
    };

    /**
     * `pipelines.*`: the modular SDK has no pipelines package either. Only
     * what the specs read: a pipeline's ID by name, and its updates.
     */
    readonly pipelines = {
        /** By the name in the bundle: a development target prefixes it with `[dev <user>] `. */
        idByName: async (name: string): Promise<string | undefined> => {
            const { statuses } = await this.api<{
                statuses?: { pipeline_id: string; name: string }[];
            }>("GET", "/api/2.0/pipelines", {
                filter: `name LIKE '%${name}'`,
            });
            return statuses?.find((s) => s.name === name || s.name.endsWith(`] ${name}`))
                ?.pipeline_id;
        },
        listUpdates: async (pipelineId: string): Promise<PipelineUpdate[]> =>
            (
                await this.api<{ updates?: PipelineUpdate[] }>(
                    "GET",
                    `/api/2.0/pipelines/${pipelineId}/updates`,
                    {},
                )
            ).updates ?? [],
    };

    private call<T>(
        method: "GET" | "POST",
        endpoint: string,
        params: Record<string, unknown>,
    ): Promise<T> {
        return this.api(
            method,
            `/api/2.0/workspace/${endpoint}`,
            params,
            `workspace/${endpoint} ${String(params.path)}`,
        );
    }

    private async api<T>(
        method: "GET" | "POST",
        apiPath: string,
        params: Record<string, unknown>,
        what = apiPath,
    ): Promise<T> {
        const profile = await resolve(this.options.profileOptions);
        if (profile.host === undefined) {
            throw new Error("The profile has no host");
        }
        const host = profile.host.replace(/\/+$/, "");
        const headers = new Headers();
        for (const h of await defaultCredentials({ profile: { ...profile, host } }).authHeaders()) {
            headers.set(h.key, h.value);
        }
        let url = `${host}${apiPath}`;
        let body: string | undefined;
        if (method === "GET") {
            url += `?${new URLSearchParams(params as Record<string, string>).toString()}`;
        } else {
            headers.set("Content-Type", "application/json");
            body = JSON.stringify(params);
        }
        const response = await fetch(url, {
            method,
            headers,
            ...(body !== undefined ? { body } : {}),
        });
        if (!response.ok) {
            throw new Error(`${what}: ${response.status} ${await response.text()}`);
        }
        return (await response.json()) as T;
    }

    readonly clusters = {
        get: (request: { clusterId: string }): Promise<ClusterInfo> =>
            new ClustersClient(this.options).getCluster(request),
    };

    readonly jobs = {
        list: (request: { name?: string }): AsyncIterable<BaseJob> =>
            new JobsClient(this.options).listJobsIter(request),
    };
}
