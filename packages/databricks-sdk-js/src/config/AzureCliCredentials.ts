import {refreshableTokenProvider, Token} from "./Token";
import {
    RequestVisitor,
    Config,
    CredentialProvider,
    ConfigError,
    AuthType,
} from "./Config";
import {Provider} from "../types";
import {
    execFileWithShell,
    FileNotFoundException,
    isExecFileException,
} from "./execUtils";

// Resource ID of the Azure application we need to log in.
const azureDatabricksLoginAppID = "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d";

/**
 * Authenticate using Azure CLI
 */
export class AzureCliCredentials implements CredentialProvider {
    public name: AuthType = "azure-cli";

    async configure(config: Config): Promise<RequestVisitor | undefined> {
        if (!config.isAzure()) {
            return;
        }

        const appId = config.azureLoginAppId || azureDatabricksLoginAppID;
        const ts = this.getTokenSource(config, appId);

        try {
            await ts();
        } catch (error) {
            if (error instanceof ConfigError) {
                if (error.message.indexOf("Can't find 'az' command") >= 0) {
                    config.logger.debug(
                        "Most likely Azure CLI is not installed. " +
                            "See https://docs.microsoft.com/en-us/cli/azure/?view=azure-cli-latest for details"
                    );
                    return;
                }
                throw error;
            }

            throw error;
        }

        return refreshableTokenProvider(ts);
    }

    getTokenSource(config: Config, appId: string): Provider<Token> {
        return async () => {
            let stdout = "";
            try {
                ({stdout} = await execFileWithShell("az", [
                    "account",
                    "get-access-token",
                    "--resource",
                    appId,
                    "--output",
                    "json",
                ]));
            } catch (e: any) {
                if (e instanceof FileNotFoundException) {
                    throw new ConfigError(
                        "azure-cli: Can't find 'az' command. Please install Azure CLI: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli",
                        config
                    );
                }
                if (isExecFileException(e)) {
                    throw new ConfigError(
                        `azure-cli: cannot get access token: ${e.stderr}`,
                        config
                    );
                }
                throw new ConfigError(
                    `azure-cli: cannot get access token: ${e + ""}`,
                    config
                );
            }

            let token: Token;
            let azureToken: any;

            try {
                azureToken = JSON.parse(stdout);
                token = new Token({
                    accessToken: azureToken.accessToken,
                    expiry: new Date(azureToken.expiresOn).getTime(),
                });
            } catch (e: any) {
                throw new ConfigError(
                    `azure-cli: cannot parse access token: ${e.message}`,
                    config
                );
            }

            config.logger.info(
                `Refreshed OAuth token for ${appId} from Azure CLI, which expires on ${azureToken.expiresOn}`
            );
            return token;
        };
    }
}
