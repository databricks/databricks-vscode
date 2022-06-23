import {
    CredentialProvider,
    Credentials,
    CredentialsProviderError,
} from "./CredentialProvider";
import {loadConfigFile} from "../configFile";

export const DEFAULT_PROFILE = "DEFAULT";

export const fromConfigFile = (
    profile: string = DEFAULT_PROFILE,
    configFile?: string
): CredentialProvider => {
    let cachedValue: Credentials;

    return async () => {
        if (cachedValue) {
            return cachedValue;
        }

        const config = await loadConfigFile(configFile);

        if (config[profile].host && config[profile].token) {
            cachedValue = config[profile];
            return cachedValue;
        }

        throw new CredentialsProviderError(
            "Can't load credentials from config file"
        );
    };
};
