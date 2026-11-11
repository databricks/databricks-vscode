import type { HttpClient } from "@databricks/sdk-core/http";
import { z } from "zod";
import type { Logger } from "../../platform/log";
import { hostKey } from "./hostMatching";

/**
 * What a host says about itself at `/.well-known/databricks-config`, which
 * needs no authentication. The SDK's own helper isn't exported and drops
 * `host_type`, so this reads it through the kernel's transport.
 */
export interface HostMetadata {
    /** `unified` for one URL that serves the account and its workspaces. */
    readonly hostType?: string;
    readonly accountId?: string;
}

const schema = z.object({
    host_type: z.string().optional(),
    account_id: z.string().optional(),
});

/** Host metadata, fetched once per host for the session. A failed fetch isn't kept, so the next call tries again. */
export class HostMetadataCache {
    private readonly cache = new Map<string, Promise<HostMetadata>>();

    constructor(
        /** The kernel's transport, never the global `fetch`: tests answer through it. */
        private readonly httpClient: HttpClient,
        private readonly log?: Logger,
    ) {}

    /** The host's metadata, or undefined when it can't be fetched (offline, or an older host). */
    async get(host: string, signal?: AbortSignal): Promise<HostMetadata | undefined> {
        const key = hostKey(host);
        if (key === undefined) {
            return undefined;
        }
        let pending = this.cache.get(key);
        if (pending === undefined) {
            pending = this.fetch(key, signal);
            this.cache.set(key, pending);
        }
        try {
            return await pending;
        } catch (error) {
            if (this.cache.get(key) === pending) {
                this.cache.delete(key);
            }
            this.log?.warn(`Can't read the host metadata of ${key}`, error);
            return undefined;
        }
    }

    private async fetch(host: string, signal?: AbortSignal): Promise<HostMetadata> {
        const response = await this.httpClient.send({
            url: `${host}/.well-known/databricks-config`,
            method: "GET",
            headers: new Headers(),
            ...(signal !== undefined ? { signal } : {}),
        });
        const text = await new Response(response.body).text();
        if (response.statusCode !== 200) {
            throw new Error(`status ${response.statusCode}: ${text.slice(0, 200)}`);
        }
        const parsed = schema.parse(JSON.parse(text));
        return {
            ...(parsed.host_type !== undefined ? { hostType: parsed.host_type } : {}),
            ...(parsed.account_id !== undefined ? { accountId: parsed.account_id } : {}),
        };
    }
}
