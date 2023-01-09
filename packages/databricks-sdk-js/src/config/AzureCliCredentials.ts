import * as child_process from "node:child_process";
import {promisify} from "node:util";
import {refreshableTokenProvider, Token} from "./Token";
import {
    RequestVisitor,
    Config,
    CredentialProvider,
    ConfigError,
} from "./Config";
import {Provider} from "../types";

const execFile = promisify(child_process.execFile);

// Resource ID of the Azure application we need to log in.
const azureDatabricksLoginAppID = "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d";

export class AzureCliCredentials implements CredentialProvider {
    public name = "azure-cli";

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
            } else {
                throw error;
            }
        }

        return refreshableTokenProvider(ts);
    }

    getTokenSource(config: Config, appId: string): Provider<Token> {
        return async () => {
            let stdout = "";
            try {
                ({stdout} = await execFile(
                    "az",
                    [
                        "account",
                        "get-access-token",
                        "--resource",
                        azureDatabricksLoginAppID,
                    ],
                    {shell: true}
                ));
            } catch (e: any) {
                if (e.code === "ENOENT") {
                    throw new ConfigError(
                        "azure-cli: Can't find 'az' command. Please install Azure CLI: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli",
                        config
                    );
                } else {
                    throw new ConfigError(
                        `azure-cli: cannot get access token: ${e.stderr}`,
                        config
                    );
                }
            }

            const azureToken = JSON.parse(stdout);
            const token = new Token({
                accessToken: azureToken.accessToken,
                expiry: new Date(azureToken.expiresOn).getTime(),
            });
            config.logger.info(
                `Refreshed OAuth token for ${appId} from Azure CLI, which expires on ${azureToken.expiresOn}`
            );
            return token;
        };
    }
}
