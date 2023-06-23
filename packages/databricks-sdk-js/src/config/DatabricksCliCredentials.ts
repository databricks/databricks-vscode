import {Provider} from "../types";
import {
    AuthType,
    Config,
    ConfigError,
    CredentialProvider,
    RequestVisitor,
} from "./Config";
import {execFile, isFileNotFound} from "./execUtils";
import {refreshableTokenProvider, Token} from "./Token";
import semver from "semver";

/**
 * Authenticate through the Databricks CLI.
 */
export class DatabricksCliCredentials implements CredentialProvider {
    public name: AuthType = "databricks-cli";

    async configure(config: Config): Promise<RequestVisitor | undefined> {
        if (!config.isAws()) {
            return;
        }

        if (config.host === "") {
            return;
        }

        const ts = this.getTokenSource(config);
        try {
            await ts();
        } catch (e) {
            if (e instanceof ConfigError) {
                if (e.message.indexOf("Can't find 'databricks' command") >= 0) {
                    config.logger.debug(
                        "Most likely Databricks CLI is not installed"
                    );
                    return;
                } else if (
                    e.message
                        .toLowerCase()
                        .indexOf("databricks OAuth is not") >= 0
                ) {
                    return;
                }
                throw e;
            }

            throw e;
        }

        return refreshableTokenProvider(ts);
    }

    private getTokenSource(config: Config): Provider<Token> {
        return async () => {
            const args = ["auth", "token"];

            if (config.isAccountClient()) {
                args.push("--account-id", config.accountId!);
            } else {
                args.push("--host", config.host!);
            }

            const databricksCli = config.databricksCliPath || "databricks";

            try {
                const child = await execFile(databricksCli, ["version"]);
                const versionString = child.stdout.trim();
                if (
                    !versionString ||
                    !semver.valid(versionString) ||
                    semver.lt(versionString, "0.100.0")
                ) {
                    throw new ConfigError(
                        `databricks-cli: Legacy version of the Databricks CLI detected. Please upgrade to version 0.100.0 or higher.`,
                        config
                    );
                }
            } catch (e) {
                if (isFileNotFound(e)) {
                    throw new ConfigError(
                        "databricks-cli: Can't find 'databricks' command.",
                        config
                    );
                }
            }

            try {
                const child = await execFile(databricksCli, args);

                let token: any;
                try {
                    token = JSON.parse(child.stdout);
                    if (!token.access_token || !token.expiry) {
                        throw new Error();
                    }
                } catch (e) {
                    throw new ConfigError(
                        `databricks-cli: cannot unmarshal Databricks CLI result: ${e}`,
                        config
                    );
                }
                return new Token({
                    accessToken: token.access_token,
                    expiry: new Date(token.expiry).getTime(),
                });
            } catch (e) {
                throw new ConfigError(
                    `databricks-cli: cannot get access token: ${e + ""}`,
                    config
                );
            }
        };
    }
}
