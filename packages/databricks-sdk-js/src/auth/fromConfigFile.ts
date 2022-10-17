import {
    CredentialProvider,
    Credentials,
    CredentialsProviderError,
} from "./types";
import {loadConfigFile} from "./configFile";

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

        if (!(config as Object).hasOwnProperty(profile)) {
            throw new CredentialsProviderError(`Can't find profile ${profile}`);
        }

        const details = config[profile];
        if (details.value === undefined) {
            throw new CredentialsProviderError(
                `Can't load profile ${profile}: ${config[profile].error?.name}: ${config[profile].error?.message}`
            );
        }

        cachedValue = details.value;
        return cachedValue;
    };
};
