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

/**
 * Authenticate through the Bricks CLI.
 */
export class BricksCliCredentials implements CredentialProvider {
    public name: AuthType = "bricks-cli";

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
                if (e.message.indexOf("Can't find 'bricks' command") >= 0) {
                    config.logger.debug(
                        "Most likely Bricks CLI is not installed"
                    );
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

            const bricksCli = config.bricksCliPath || "bricks";

            try {
                const child = await execFile(bricksCli, args);

                let token: any;
                try {
                    token = JSON.parse(child.stdout);
                    if (!token.access_token || !token.expiry) {
                        throw new Error();
                    }
                } catch (e) {
                    throw new ConfigError(
                        `bricks-cli: cannot unmarshal Bricks CLI result: ${e}`,
                        config
                    );
                }
                return new Token({
                    accessToken: token.access_token,
                    expiry: new Date(token.expiry).getTime(),
                });
            } catch (e) {
                if (isFileNotFound(e)) {
                    throw new ConfigError(
                        "bricks-cli: Can't find 'bricks' command.",
                        config
                    );
                } else {
                    throw new ConfigError(
                        `bricks-cli: cannot get access token: ${e + ""}`,
                        config
                    );
                }
            }
        };
    }
}
