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
import {Issuer, TokenSet} from "openid-client";

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
        const client = this.getOAuthClient(config);
        await azureEnsureWorkspaceUrl(config, client);

        config.logger.info(
            `Generating AAD token for Service Principal (${config.azureClientId})`
        );

        let innerToken: TokenSet | undefined;
        let cloudToken: TokenSet | undefined;

        return async (headers: Headers) => {
            if (!innerToken || innerToken.expired()) {
                innerToken = await client.grant({
                    grant_type: "client_credentials",
                    resource: [getAzureLoginAppId(config)],
                });
            }

            if (!cloudToken || cloudToken.expired()) {
                cloudToken = await client.grant({
                    grant_type: "client_credentials",
                    resource: [env.serviceManagementEndpoint],
                });
            }

            if (config.azureResourceId) {
                headers["X-Databricks-Azure-Workspace-Resource-Id"] =
                    config.azureResourceId;
            }
            headers["Authorization"] = `Bearer ${innerToken.access_token}`;
            headers["X-Databricks-Azure-SP-Management-Token"] =
                cloudToken.access_token || "";
        };
    }

    getOAuthClient(config: Config): InstanceType<Issuer["Client"]> {
        const env = getAzureEnvironment(config);
        const issuer = new Issuer({
            issuer: env.activeDirectoryEndpoint,
            token_endpoint: `${env.activeDirectoryEndpoint}/${config.azureTenantId}/oauth2/token`,
        });

        const client = new issuer.Client({
            client_id: config.azureClientId!,
            client_secret: config.azureClientSecret!,
        });

        return client;
    }
}
