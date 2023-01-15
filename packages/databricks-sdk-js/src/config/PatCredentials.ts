import {
    RequestVisitor,
    Config,
    CredentialProvider,
    Headers,
    AuthType,
} from "./Config";

/**
 * Authenticate using a personal access token (PAT)
 */
export class PatCredentials implements CredentialProvider {
    public name: AuthType = "pat";

    async configure(config: Config): Promise<RequestVisitor | undefined> {
        if (!config.token || !config.host) {
            return;
        }

        return async function (headers: Headers): Promise<void> {
            headers["Authorization"] = `Bearer ${config.token}`;
        };
    }
}
