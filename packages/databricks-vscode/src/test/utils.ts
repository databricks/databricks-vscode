import http from "node:http";
import type {RequestOptions} from "node:https";
import {ProviderResult} from "vscode";

export async function resolveProviderResult<T>(
    result: ProviderResult<T>
): Promise<T | null | undefined> {
    if (!result) {
        return result;
    }

    if (Object.prototype.hasOwnProperty.call(result, "then")) {
        return await result;
    } else {
        return result;
    }
}

/**
 * Records the options of `http.request` calls to `host` until `restore()`.
 * Typed as https options because the SDK's fetch passes TLS options such as
 * `rejectUnauthorized` to `http.request` too.
 */
export function recordHttpRequests(host: URL) {
    const original = http.request;
    const requests: RequestOptions[] = [];
    http.request = ((...args: Parameters<typeof http.request>) => {
        const options = args.find(
            (arg): arg is RequestOptions =>
                typeof arg === "object" && !(arg instanceof URL)
        );
        if (
            options?.hostname === host.hostname &&
            String(options.port) === host.port
        ) {
            requests.push(options);
        }
        return original(...args);
    }) as typeof http.request;
    return {
        requests,
        restore: () => {
            http.request = original;
        },
    };
}
