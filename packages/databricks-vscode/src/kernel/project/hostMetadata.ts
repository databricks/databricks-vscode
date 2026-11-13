import type { HttpClient } from "@databricks/sdk-core/http";
import { z } from "zod";
import type { Logger } from "../../platform/log";
import { hostKey, isDatabricksDomain } from "../connection/hostMatching";
import type { HostMetadata } from "./targetAccess";

const DatabricksConfig = z.object({
    host_type: z.string().optional(),
    workspace_id: z.union([z.string(), z.number()]).optional(),
});

/**
 * What a Databricks host says about itself, asked without any credential:
 * `GET <host>/.well-known/databricks-config`. Deliberately not an SDK client
 * from `connection.api`, which would attach the session's token, the very
 * thing the target guard decides where it may go. Only Databricks domains
 * are asked. Undefined when the host isn't one, doesn't answer, or answers
 * something else; the guard then keeps the target paused. An answer is kept
 * for the window, an unhelpful one too. A failed read is asked again at the
 * next command; a read that timed out is asked again after a minute.
 */
/** How long a host whose read timed out is left alone before it's asked again. */
const RETRY_AFTER_TIMEOUT_MS = 60_000;

export function hostMetadataReader(
    httpClient: HttpClient,
    log: Logger,
    timeoutMs = 10_000,
): (host: string, signal?: AbortSignal) => Promise<HostMetadata | undefined> {
    const known = new Map<string, Promise<HostMetadata | undefined>>();
    return (host, signal) => {
        const key = hostKey(host);
        if (key === undefined || !isDatabricksDomain(key)) {
            return Promise.resolve(undefined);
        }
        let found = known.get(key);
        if (found === undefined) {
            found = read(httpClient, key, timeoutMs).catch((e: unknown) => {
                log.warn(`Can't read what ${key} is`, e);
                if (e instanceof DOMException && e.name === "TimeoutError") {
                    // Not asked again for a minute: each command would wait out the timeout.
                    setTimeout(() => known.delete(key), RETRY_AFTER_TIMEOUT_MS);
                } else {
                    known.delete(key);
                }
                return undefined;
            });
            known.set(key, found);
        }
        if (signal === undefined) {
            return found;
        }
        return Promise.race([
            found,
            new Promise<undefined>((_resolve, reject) =>
                signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
            ),
        ]);
    };
}

async function read(
    httpClient: HttpClient,
    host: string,
    timeoutMs: number,
): Promise<HostMetadata | undefined> {
    const response = await httpClient.send({
        url: `${host}/.well-known/databricks-config`,
        method: "GET",
        // No Authorization header: nothing of the session goes to a host before it is trusted.
        headers: new Headers({ Accept: "application/json" }),
        signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await new Response(response.body).text();
    if (response.statusCode !== 200) {
        return undefined;
    }
    const parsed = DatabricksConfig.safeParse(JSON.parse(text));
    if (!parsed.success) {
        return undefined;
    }
    const { host_type: hostType, workspace_id: workspaceId } = parsed.data;
    if (hostType !== "workspace" && hostType !== "unified") {
        return undefined;
    }
    return {
        hostType,
        ...(workspaceId !== undefined ? { workspaceId: String(workspaceId) } : {}),
    };
}
