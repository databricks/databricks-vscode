/* eslint-disable @typescript-eslint/naming-convention */
import {
    azureEnsureWorkspaceUrl,
    getAzureEnvironment,
    getAzureLoginAppId,
} from "./Azure";
import {
    AuthType,
    Config,
    CredentialProvider,
    RequestVisitor,
    Headers,
} from "./Config";
import {Token} from "./Token";
import {Client} from "./oauth/Client";
import {Issuer} from "./oauth/Issuer";

export class AzureClientSecretCredentials implements CredentialProvider {
    public name: AuthType = "azure-client-secret";

    async configure(config: Config): Promise<RequestVisitor | undefined> {
        if (
            !config.azureClientId ||
            !config.azureClientSecret ||
            !config.azureTenantId
        ) {
            return;
        }
        if (!config.isAzure()) {
            return;
        }

        const env = getAzureEnvironment(config);
        const client = await this.getOAuthClient(config);

        if (!client) {
            return;
        }
        await azureEnsureWorkspaceUrl(config, client);

        config.logger.info(
            `Generating AAD token for Service Principal (${config.azureClientId})`
        );

        let innerToken: Token | undefined;
        let cloudToken: Token | undefined;

        return async (headers: Headers) => {
            if (!innerToken || !innerToken.isValid()) {
                innerToken = await client.grant({
                    grant_type: "client_credentials",
                    resource: [getAzureLoginAppId(config)],
                });
            }

            if (!cloudToken || !cloudToken.isValid()) {
                cloudToken = await client.grant({
                    grant_type: "client_credentials",
                    resource: [env.serviceManagementEndpoint],
                });
            }

            if (config.azureResourceId) {
                headers["X-Databricks-Azure-Workspace-Resource-Id"] =
                    config.azureResourceId;
            }
            headers["Authorization"] = `Bearer ${innerToken?.accessToken}`;
            headers["X-Databricks-Azure-SP-Management-Token"] =
                cloudToken?.accessToken || "";
        };
    }

    getOAuthClient(config: Config): Client {
        const env = getAzureEnvironment(config);
        const issuer = new Issuer(
            config,
            new URL(
                `${env.activeDirectoryEndpoint}/${config.azureTenantId}/oauth2/authorize`
            ),
            new URL(
                `${env.activeDirectoryEndpoint}/${config.azureTenantId}/oauth2/token`
            )
        );

        const client = issuer.getClient({
            clientId: config.azureClientId!,
            clientSecret: config.azureClientSecret!,
            useHeader: true,
        });

        return client;
    }
}
