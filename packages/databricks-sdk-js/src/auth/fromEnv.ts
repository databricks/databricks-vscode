import {
    CredentialProvider,
    CredentialsProviderError,
} from "./CredentialProvider";

export const fromEnv = (): CredentialProvider => {
    return async () => {
        const host = process.env["DATABRICKS_HOST"];
        const token = process.env["DATABRICKS_TOKEN"];

        if (host && token) {
            return {
                token: token,
                host: new URL(host),
            };
        }

        throw new CredentialsProviderError(
            "Can't find databricks environment variables"
        );
    };
};
