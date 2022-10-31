import {env, Uri} from "vscode";

export function addHttpsIfNoProtocol(url: string) {
    return `${url}`.startsWith("http") ? `${url}` : `https://${url}`;
}
export async function openExternal(url: string) {
    await env.openExternal(Uri.parse(addHttpsIfNoProtocol(url), true));
}
