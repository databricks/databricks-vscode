import * as child_process from "node:child_process";
import {promisify} from "node:util";
import {refreshableTokenProvider, Token} from "./Token";
import {CredentialsProviderError} from "../auth/types";
import {RequestVisitor, Config, CredentialProvider} from "./Config";

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

        return refreshableTokenProvider(async () => {
            let stdout = "";
            try {
                ({stdout} = await execFile("az", [
                    "account",
                    "get-access-token",
                    "--resource",
                    azureDatabricksLoginAppID,
                ]));
            } catch (e: any) {
                if (e.code === "ENOENT") {
                    throw new CredentialsProviderError(
                        "Can't find 'az' command. Please install Azure CLI: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli'"
                    );
                } else {
                    throw e;
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
        });
    }
}
