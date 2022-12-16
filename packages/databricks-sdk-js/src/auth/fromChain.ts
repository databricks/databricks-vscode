import {CredentialProvider, CredentialsProviderError} from "./types";
import {fromToken} from "./fromToken";
import {fromConfigFile} from "./fromConfigFile";

export const fromChain = (
    chain: Array<CredentialProvider>
): CredentialProvider => {
    let cachedProvider: CredentialProvider;

    return async () => {
        if (cachedProvider) {
            return await cachedProvider();
        }

        for (const provider of chain) {
            try {
                const credentials = await provider();
                cachedProvider = provider;
                return credentials;
            } catch (e) {}
        }

        throw new CredentialsProviderError(
            "No valid credential provider found"
        );
    };
};

export const fromDefaultChain = fromChain([fromToken(), fromConfigFile()]);
