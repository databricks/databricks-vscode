import {
    RequestVisitor,
    Config,
    CredentialProvider,
    Headers,
    AuthType,
} from "./Config";

/**
 * Authenticate using username and password
 */
export class BasicCredentials implements CredentialProvider {
    public name: AuthType = "basic";

    async configure(config: Config): Promise<RequestVisitor | undefined> {
        if (!config.username || !config.password || !config.host) {
            return;
        }

        const tokenUnB64 = `${config.username}:${config.password}`;
        const b64 = Buffer.from(tokenUnB64).toString("base64");

        return async (headers: Headers) => {
            headers["Authorization"] = `Basic ${b64}`;
        };
    }
}
