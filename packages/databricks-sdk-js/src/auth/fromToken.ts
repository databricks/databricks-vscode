import {CredentialProvider, CredentialsProviderError} from "./types";

function getValidHost(host: string) {
    return !/https:\/\/.+/.test(host) && !/http:\/\/.+/.test(host)
        ? `https://${host}`
        : host;
}

function strip(strToStrip: string, str: string) {
    return str.split(strToStrip).join("");
}

export const fromToken = (host?: URL, token?: string): CredentialProvider => {
    return async () => {
        token = token || process.env["DATABRICKS_TOKEN"];
        if (!host) {
            const hostEnv = process.env["DATABRICKS_HOST"];
            if (!hostEnv) {
                throw new CredentialsProviderError(
                    "Can't find DATABRICKS_HOST environment variable"
                );
            }
            host = new URL(getValidHost(strip("'", hostEnv)));
        }

        if (host && token) {
            return {
                token: strip("'", token),
                host,
            };
        }

        throw new CredentialsProviderError(
            "Can't find databricks environment variables"
        );
    };
};
