import {AzureCliCredentials} from "./AzureCliCredentials";
import {BasicCredentials} from "./BasicCredentials";
import {
    RequestVisitor,
    Config,
    CredentialProvider,
    ConfigError,
} from "./Config";
import {PatCredentials} from "./PatCredentials";

export class DefaultCredentials implements CredentialProvider {
    public name = "default";

    async configure(config: Config): Promise<RequestVisitor> {
        const defaultChain: Array<CredentialProvider> = [
            new PatCredentials(),
            new BasicCredentials(),
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
