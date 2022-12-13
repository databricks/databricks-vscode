import {Token} from "./Token";
import {CredentialProvider, TokenSource} from "./types";

export function refreshableCredentialProvider(
    source: TokenSource
): CredentialProvider {
    let token: Token | undefined;

    return async () => {
        if (!token || token.isExpired) {
            token = await source();
        }

        return {
            token: token.accessToken,
            host: token.host,
        };
    };
}
