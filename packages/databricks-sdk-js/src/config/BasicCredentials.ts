import {RequestVisitor, Config, CredentialProvider, AuthType} from "./Config";
import {Headers} from "../fetch";

/**
 * Authenticate using username and password
 */
export class BasicCredentials implements CredentialProvider {
    public name: AuthType = "basic";

    async configure(config: Config): Promise<RequestVisitor | undefined> {
        if (!config.username || !config.password || !config.host) {
            return;
        }

        return async (headers: Headers) => {
            headers["Authorization"] = getBasicAuthHeader(
                config.username!,
                config.password!
            );
        };
    }
}

export function getBasicAuthHeader(username: string, password: string): string {
    const tokenUnB64 = `${username}:${password}`;
    const b64 = Buffer.from(tokenUnB64).toString("base64");

    return `Basic ${b64}`;
}
