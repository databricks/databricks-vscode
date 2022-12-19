import * as child_process from "node:child_process";
import {promisify} from "node:util";
import {refreshableCredentialProvider} from "./refreshableCredentialProvider";
import {Token} from "./Token";
import {CredentialProvider, CredentialsProviderError} from "./types";

const execFile = promisify(child_process.execFile);

// Resource ID of the Azure application we need to log in.
const azureDatabricksLoginAppID = "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d";

/**
 * Credentials provider that uses Azure CLI to get a token.
 *
 * If host is not passed in then it will be read from DATABRICKS_HOST environment variable.
 */
export const fromAzureCli = (host?: URL): CredentialProvider => {
    if (!host) {
        const hostEnv = process.env["DATABRICKS_HOST"];
        if (!hostEnv) {
            throw new CredentialsProviderError(
                "Can't find DATABRICKS_HOST environment variables"
            );
        }

        host = new URL(hostEnv);
    }

    return refreshableCredentialProvider(async () => {
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
        return new Token(
            host!,
            azureToken.accessToken,
            new Date(azureToken.expiresOn).getTime()
        );
    });
};
