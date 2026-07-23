import {env} from "vscode";

/**
 * Detect whether the extension is running inside Cursor rather than plain
 * VS Code. Cursor reports `env.appName` as "Cursor" (and `env.appHost` as
 * "desktop", same as VS Code), so we match on the app name.
 */
export function isCursor(): boolean {
    return /cursor/i.test(env.appName);
}
