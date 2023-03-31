export const EXTENSION_DEVELOPMENT = "EXTENSION_DEVELOPMENT";

export function isDevExtension(): boolean {
    return process.env.EXTENSION_DEVELOPMENT === "true"
}