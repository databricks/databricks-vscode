import type { ExtensionMode } from "./definitions";

export function isDevExtension(env: NodeJS.ProcessEnv = process.env): boolean {
    return env.EXTENSION_DEVELOPMENT === "true";
}

function isIntegrationTest(env: NodeJS.ProcessEnv = process.env): boolean {
    return env.DATABRICKS_VSCODE_INTEGRATION_TEST === "true";
}

/** The `context.*` metadata sent with every event. */
export function contextMetadata(mode: ExtensionMode, env: NodeJS.ProcessEnv = process.env) {
    return {
        environmentType: isIntegrationTest(env) ? "tests" : "prod",
        mode,
        flavor: "next",
    } as const;
}
