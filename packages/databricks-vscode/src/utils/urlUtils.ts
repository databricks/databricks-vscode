import {env, Uri} from "vscode";

export function addHttpsIfNoProtocol(url: string) {
    return `${url}`.startsWith("http") ? `${url}` : `https://${url}`;
}
export async function openExternal(url: string) {
    await env.openExternal(Uri.parse(addHttpsIfNoProtocol(url), true));
}

export function normalizeHost(host: string): URL {
    let url: URL;

    if (!host.startsWith("http")) {
        host = `https://${host}`;
    }
    try {
        url = new URL(host);
    } catch (e) {
        throw new Error("Invalid host name");
    }
    if (url.protocol !== "https:") {
        throw new Error("Invalid protocol");
    }
    if (
        !url.hostname.match(
            /(\.azuredatabricks\.net|\.gcp\.databricks\.com|\.cloud\.databricks\.com)$/
        )
    ) {
        throw new Error("Not a Databricks host");
    }

    return new URL(`https://${url.hostname}`);
}
