/* eslint-disable @typescript-eslint/naming-convention */
import {
    AuthType,
    Config,
    ConfigError,
    CredentialProvider,
    RequestVisitor,
} from "./Config";
import fetch from "node-fetch-commonjs";
import {refreshableTokenProvider, Token} from "./Token";
import {Provider} from "../types";

interface ServerResponse {
    host?: string;
    access_token?: string;
    expires_in?: number;
    token_type?: string;
}

/**
 * Credentials provider that fetches a token from a locally running HTTP server.
 *
 * The credentials provider will perform a GET request to the configured URL.
 * The header "Metadata: true" will be added to the request, which must be
 * verified by server to prevent SSRF attacks
 *
 * The server is expected to return a JSON response with the following fields:
 *
 * host: URL of the Databricks host to connect to.
 * access_token: The requested access token.
 * token_type: The type of token, which is a "Bearer" access token.
 * expires_on: The timespan when the access token expires.
 */
export class LocalMetadataServiceCredentials implements CredentialProvider {
    public name: AuthType = "local-metadata-service";

    async configure(config: Config): Promise<RequestVisitor | undefined> {
        if (!config.localMetadataServiceUrl) {
            return;
        }

        let parsedMetadataServiceUrl: URL;
        try {
            parsedMetadataServiceUrl = new URL(config.localMetadataServiceUrl);
        } catch (error) {
            throw new ConfigError(
                `invalid auth server URL: ${config.localMetadataServiceUrl}`,
                config
            );
        }

        // only allow localhost URLs
        if (
            parsedMetadataServiceUrl.hostname !== "localhost" &&
            parsedMetadataServiceUrl.hostname !== "127.0.0.1"
        ) {
            throw new ConfigError(
                `invalid auth server URL: ${config.localMetadataServiceUrl}`,
                config
            );
        }

        let response: ServerResponse | undefined;
        try {
            response = await this.makeRequest(config, parsedMetadataServiceUrl);
        } catch (error) {
            return;
        }

        if (!response || !response.host || !response.access_token) {
            return;
        }

        const configHost =
            config.host && (await (await config.getHost()).toString());

        if (configHost && configHost !== response.host) {
            return;
        }

        config.host = response.host;

        const ts = this.getTokenSource(config, parsedMetadataServiceUrl);
        return refreshableTokenProvider(ts);
    }

    private getTokenSource(config: Config, url: URL): Provider<Token> {
        return async () => {
            const serverResponse = await this.makeRequest(config, url);
            if (!serverResponse) {
                throw new ConfigError(
                    `error fetching auth server URL: ${url}`,
                    config
                );
            }

            if (serverResponse.host !== config.host) {
                throw new ConfigError(
                    `host in token (${serverResponse.host}) doesn't match configured host (${config.host})`,
                    config
                );
            }

            config.logger.info(
                `Refreshed access token from local credentials server, which expires on ${serverResponse.expires_in}`
            );

            return new Token({
                accessToken: serverResponse.access_token || "",
                expiry: serverResponse.expires_in || 0,
            });
        };
    }

    private async makeRequest(
        config: Config,
        url: URL
    ): Promise<ServerResponse | undefined> {
        let body: ServerResponse;
        try {
            const response = await fetch(url.toString(), {
                headers: {
                    Metadata: "true",
                },
            });

            if (response.status === 404) {
                return;
            }

            body = (await response.json()) as any;
        } catch (error) {
            throw new ConfigError(
                `error fetching auth server URL: ${url}`,
                config
            );
        }

        try {
            if (body.host) {
                const parsedHost = new URL(body.host);
                body.host = parsedHost.toString();
            }
        } catch (error) {
            throw new ConfigError(
                `invalid host in auth server response: ${body.host}`,
                config
            );
        }

        return body;
    }
}
