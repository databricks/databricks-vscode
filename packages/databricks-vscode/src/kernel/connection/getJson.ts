import { ApiError } from "@databricks/sdk-core/apierror";
import { execute } from "@databricks/sdk-core/ops";
import type { CallOptions } from "@databricks/sdk-options/call";
import type { ClientOptions } from "@databricks/sdk-options/client";
import type { z } from "zod";
import { nodeHttpClient } from "./nodeHttpClient";
import { buildUserAgent } from "./userAgent";

/**
 * A GET for the gap client (`ClusterListClient`), as
 * an SDK client sends it: the connection's credentials, workspace ID and
 * transport, the call's retrier and timeout, and an `ApiError` for an error
 * response. Parses the body, empty or JSON, with `schema`.
 */
export async function getJson<S extends z.ZodType>(
    clientOptions: ClientOptions,
    url: string,
    schema: S,
    options: CallOptions,
): Promise<z.output<S>> {
    const { workspaceId, credentials } = clientOptions;
    const httpClient = clientOptions.httpClient ?? nodeHttpClient();
    let result: z.output<S> | undefined;
    await execute(
        options.signal,
        async (signal) => {
            const headers = new Headers();
            for (const h of (await credentials?.authHeaders()) ?? []) {
                headers.set(h.key, h.value);
            }
            if (workspaceId !== undefined) {
                headers.set("X-Databricks-Workspace-Id", workspaceId);
            }
            headers.set("User-Agent", buildUserAgent(credentials));
            const response = await httpClient.send({
                url,
                method: "GET",
                headers,
                ...(signal !== undefined ? { signal } : {}),
            });
            const body = new Uint8Array(await new Response(response.body).arrayBuffer());
            const error = ApiError.fromHttpError(response.statusCode, response.headers, body);
            if (error !== undefined) {
                throw error;
            }
            const text = new TextDecoder().decode(body);
            result = schema.parse(text === "" ? {} : JSON.parse(text));
        },
        {
            ...(options.retrier !== undefined ? { retrier: options.retrier } : {}),
            ...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
        },
    );
    if (result === undefined) {
        throw new Error("operation completed without a result.");
    }
    return result;
}
