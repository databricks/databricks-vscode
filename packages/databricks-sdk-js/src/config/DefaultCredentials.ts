import {AzureCliCredentials} from "./AzureCliCredentials";
import {BasicCredentials} from "./BasicCredentials";
import {BricksCliCredentials} from "./BricksCliCredentials";
import {
    RequestVisitor,
    Config,
    CredentialProvider,
    ConfigError,
    AuthType,
} from "./Config";
import {MetadataServiceCredentials} from "./MetadataServiceCredentials";
import {PatCredentials} from "./PatCredentials";

export class DefaultCredentials implements CredentialProvider {
    public name: AuthType = "default";

    async configure(config: Config): Promise<RequestVisitor> {
        const defaultChain: Array<CredentialProvider> = [
            new MetadataServiceCredentials(),
            new PatCredentials(),
            new BasicCredentials(),
            new BricksCliCredentials(),
            // new AzureClientSecretCredentials(),
            new AzureCliCredentials(),
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
