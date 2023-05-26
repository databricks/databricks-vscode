/* eslint-disable @typescript-eslint/naming-convention */
import {
    AuthType,
    Config,
    ConfigError,
    CredentialProvider,
    RequestVisitor,
} from "./Config";
import {Token, refreshableTokenProvider} from "./Token";
import {Issuer} from "openid-client";

/**
 * M2mCredentials provides OAuth2.0 client credentials flow for service principals
 */
export class M2mCredentials implements CredentialProvider {
    public name: AuthType = "oauth-m2m";

    async configure(config: Config): Promise<RequestVisitor | undefined> {
        if (!config.clientId || !config.clientSecret) {
            return;
        }

        let client: InstanceType<Issuer["Client"]>;
        try {
            const issuer = await getIssuer(config);
            client = new issuer.Client({
                client_id: config.clientId,
                client_secret: config.clientSecret,
            });
        } catch (error: any) {
            throw new ConfigError(`oidc: ${error.message}`, config);
        }

        config.logger.debug(
            `Generating Databricks OAuth token for Service Principal (${config.clientId})`
        );

        return refreshableTokenProvider(async () => {
            const tokenSet = await client.grant({
                grant_type: "client_credentials",
                scope: "all-apis",
            });

            return new Token({
                accessToken: tokenSet.access_token!,
                expiry: tokenSet.expires_at! * 1000,
            });
        });
    }
}

async function getIssuer(config: Config): Promise<Issuer> {
    if (config.isAccountClient() && config.accountId) {
        const prefix = `${config.host}/oidc/accounts/${config.accountId}`;
        return new Issuer({
            issuer: prefix,
            authorization_endpoint: `${prefix}/v1/authorize`,
            token_endpoint: `${prefix}/v1/token`,
            token_endpoint_auth_methods_supported: ["client_secret_basic"],
        });
    }

    return await Issuer.discover(`${config.host!}/oidc`);
}
