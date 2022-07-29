import {CredentialProvider, CredentialsProviderError} from "./types";

function getValidHost(host: string) {
    return !/https:\/\/.+/.test(host) && !/http:\/\/.+/.test(host)
        ? `https://${host}`
        : host;
}

function strip(strToStrip: string, str: string) {
    return str.split(strToStrip).join("");
}

export const fromEnv = (): CredentialProvider => {
    return async () => {
        const host = process.env["DATABRICKS_HOST"];
        const token = process.env["DATABRICKS_TOKEN"];

        if (host && token) {
            return {
                token: strip("'", token),
                host: new URL(getValidHost(strip("'", host))),
            };
        }

        throw new CredentialsProviderError(
            "Can't find databricks environment variables"
        );
    };
};
