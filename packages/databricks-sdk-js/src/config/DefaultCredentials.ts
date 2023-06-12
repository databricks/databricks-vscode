import {AzureCliCredentials} from "./AzureCliCredentials";
import {BasicCredentials} from "./BasicCredentials";
import {DatabricksCliCredentials} from "./DatabricksCliCredentials";
import {
    RequestVisitor,
    Config,
    CredentialProvider,
    ConfigError,
    AuthType,
} from "./Config";
import {MetadataServiceCredentials} from "./MetadataServiceCredentials";
import {PatCredentials} from "./PatCredentials";
import {M2mCredentials} from "./M2mCredentials";

export class DefaultCredentials implements CredentialProvider {
    public name: AuthType = "default";

    async configure(config: Config): Promise<RequestVisitor> {
        const defaultChain: Array<CredentialProvider> = [
            new PatCredentials(),
            new BasicCredentials(),
            new M2mCredentials(),
            new DatabricksCliCredentials(),
            new MetadataServiceCredentials(),

            // Attempt to configure auth from most specific to most generic (the Azure CLI).
            // new AzureMsiCredentials(),
            // new AzureClientSecretCredentials(),
            new AzureCliCredentials(),

            // Attempt to configure auth from most specific to most generic (Google Application Default Credentials).
            // new GoogleDefaultCredentials(),
            // new GoogleCredentials(),
        ];

        for (const p of defaultChain) {
            if (config.authType && p.name !== config.authType) {
                config.logger.info(
                    `Ignoring ${p.name} auth, because ${config.authType} is preferred`
                );
                continue;
            }
            config.logger.info(`Attempting to configure auth: ${p.name}`);

            const visitor = await p.configure(config);
            if (visitor) {
                this.name = p.name;
                return visitor;
            }
        }

        throw new ConfigError("cannot configure default credentials", config);
    }
}
