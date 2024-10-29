export const EXTENSION_DEVELOPMENT = "EXTENSION_DEVELOPMENT";

export function isDevExtension(): boolean {
    return process.env.EXTENSION_DEVELOPMENT === "true";
}

export function isIntegrationTest(): boolean {
    return process.env.DATABRICKS_VSCODE_INTEGRATION_TEST === "true";
}
