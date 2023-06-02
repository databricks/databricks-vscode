/* eslint-disable @typescript-eslint/naming-convention */
import {
    AuthType,
    Config,
    ConfigError,
    CredentialProvider,
    RequestVisitor,
} from "./Config";
import {refreshableTokenProvider} from "./Token";
import {Client} from "./oauth/Client";
import {Issuer} from "./oauth/Issuer";

/**
 * M2mCredentials provides OAuth 2.0 client credentials flow for service principals
 */
export class M2mCredentials implements CredentialProvider {
    public name: AuthType = "oauth-m2m";

    async configure(config: Config): Promise<RequestVisitor | undefined> {
        if (!config.clientId || !config.clientSecret) {
            return;
        }

        let client: Client;
        try {
            const issuer = await Issuer.discover(config);
            if (!issuer) {
                throw new Error("Unable to discover issuer");
            }
            client = await issuer?.getClient({
                clientId: config.clientId,
                clientSecret: config.clientSecret,
                useHeader: true,
            });
        } catch (error: any) {
            throw new ConfigError(`oidc: ${error.message}`, config);
        }

        config.logger.debug(
            `Generating Databricks OAuth token for Service Principal (${config.clientId})`
        );

        return refreshableTokenProvider(async () => {
            return await client.grant("all-apis");
        });
    }
}
