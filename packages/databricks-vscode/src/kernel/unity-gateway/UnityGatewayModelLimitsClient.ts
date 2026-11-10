import type { CallOptions } from "@databricks/sdk-options/call";
import type { ClientOptions } from "@databricks/sdk-options/client";
import { z } from "zod";
import { getJson } from "../connection/getJson";

/*
 * A gap client: no SDK package has a route under
 * `/ai-gateway/`, and model services carry no token limits. Unity Gateway's
 * Anthropic models list is the one place that reports them, for every model
 * it serves on that API, not only Claude. Like an SDK client it is built by
 * `ApiClients.get`, and shares the connection's host, credentials and
 * transport.
 */

/** A model's context window and output limit, in tokens. The output is less than the window. */
export interface ModelTokenLimits {
    readonly input: number;
    readonly output: number;
}

// Entries are checked one by one, so one odd entry doesn't drop the others.
const page = z.looseObject({
    data: z.array(z.unknown()).optional(),
    has_more: z.boolean().optional(),
});
const model = z.looseObject({
    id: z.string(),
    max_input_tokens: z.number().optional(),
    max_tokens: z.number().optional(),
});

// The largest page the list serves.
const PAGE_SIZE = 1000;
// The list names some model services by an alias: `anthropic-aigw-<hash>-<model service>`.
const ALIAS_PREFIX = /^anthropic-aigw-[0-9a-f]+-/i;

const isLimit = (n: number | undefined): n is number =>
    n !== undefined && Number.isSafeInteger(n) && n > 0;

export class UnityGatewayModelLimitsClient {
    constructor(private readonly options: ClientOptions) {}

    /**
     * `GET /ai-gateway/anthropic/v1/models`, every page: the limits by model
     * service name, for example `system.ai.claude-sonnet-4-6`. The gateway
     * reports 0 for a model whose limits it doesn't know, and on a workspace
     * that doesn't report them; those models are left out, and so is one
     * whose output fills its window, which leaves no room for a prompt.
     */
    async list(options: CallOptions = {}): Promise<ReadonlyMap<string, ModelTokenLimits>> {
        const { host } = this.options;
        if (host === undefined) {
            throw new Error("Host is required.");
        }
        const url = `${host.replace(/\/+$/, "")}/ai-gateway/anthropic/v1/models`;
        const limits = new Map<string, ModelTokenLimits>();
        let after: string | undefined;
        for (;;) {
            const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
            if (after !== undefined) {
                query.set("after_id", after);
            }
            const { data = [], has_more } = await getJson(
                this.options,
                `${url}?${query.toString()}`,
                page,
                options,
            );
            let last: string | undefined;
            for (const entry of data) {
                const m = model.safeParse(entry);
                if (!m.success) {
                    continue;
                }
                last = m.data.id;
                const { max_input_tokens: input, max_tokens: output } = m.data;
                if (isLimit(input) && isLimit(output) && input > output) {
                    limits.set(m.data.id.replace(ALIAS_PREFIX, ""), { input, output });
                }
            }
            // The next page starts after the last model; a page that names none, or the same one, ends it.
            if (has_more !== true || last === undefined || last === after) {
                return limits;
            }
            after = last;
        }
    }
}
