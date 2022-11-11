import {
    CredentialProvider,
    Credentials,
    CredentialsProviderError,
} from "./types";
import {isConfigFileParsingError, loadConfigFile} from "./configFile";

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

        if (!Object.prototype.hasOwnProperty.call(config, profile)) {
            throw new CredentialsProviderError(`Can't find profile ${profile}`);
        }

        const details = config[profile];
        if (isConfigFileParsingError(details)) {
            throw new CredentialsProviderError(
                `Can't load profile ${profile}: ${details.name}: ${details.message}`
            );
        }

        cachedValue = details;
        return cachedValue;
    };
};
