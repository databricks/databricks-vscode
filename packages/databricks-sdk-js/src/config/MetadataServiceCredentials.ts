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

export const MetadataServiceVersion = "1";
export const MetadataServiceVersionHeader = "x-databricks-metadata-version";
export const MetadataServiceHostHeader = "x-databricks-host";

export interface ServerResponse {
    access_token: string;
    /* epoch in seconds since 1970-01-01T00:00:00Z */
    expires_on: number;
    token_type: string;
}

/**
 * Credentials provider that fetches a token from a locally running HTTP server
 *
 * The credentials provider will perform a GET request to the configured URL.
 *
 * The MUST return 4xx response if the "X-Databricks-Metadata-Version" header
 * is not set or set to a version that the server doesn't support.
 *
 * The server MUST guarantee stable sessions per URL path. That is, if the
 * server returns a token for a Host on a given URL path, it MUST continue to return
 * tokens for the same Host.
 *
 * The server MUST return a 4xx response if the Host passed in the "X-Databricks-Host"
 * header doesn't match the token.
 *
 * The server is expected to return a JSON response with the following fields:
 *
 * - access_token: The requested access token.
 * - token_type: The type of token, which is a "Bearer" access token.
 * - expires_on: Unix timestamp in seconds when the access token expires.
 */
export class MetadataServiceCredentials implements CredentialProvider {
    public name: AuthType = "metadata-service";

    async configure(config: Config): Promise<RequestVisitor | undefined> {
        if (!config.metadataServiceUrl || !config.host) {
            return;
        }

        let parsedMetadataServiceUrl: URL;
        try {
            parsedMetadataServiceUrl = new URL(config.metadataServiceUrl);
        } catch (error) {
            throw new ConfigError(
                `invalid auth server URL: ${config.metadataServiceUrl}`,
                config
            );
        }

        // only allow localhost URLs
        if (
            parsedMetadataServiceUrl.hostname !== "localhost" &&
            parsedMetadataServiceUrl.hostname !== "127.0.0.1"
        ) {
            throw new ConfigError(
                `invalid auth server URL: ${config.metadataServiceUrl}`,
                config
            );
        }

        const response = await this.makeRequest(
            config,
            parsedMetadataServiceUrl
        );

        if (!response) {
            return;
        }

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

            config.logger.info(
                `Refreshed access token from local credentials server, which expires on ${new Date(
                    serverResponse.expires_on * 1000
                )}`
            );

            return new Token({
                accessToken: serverResponse.access_token,
                expiry: serverResponse.expires_on * 1000,
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
                    [MetadataServiceVersionHeader]: MetadataServiceVersion,
                    [MetadataServiceHostHeader]: config.host!,
                },
            });

            if (response.status === 404) {
                return;
            }

            body = (await response.json()) as any;
        } catch (error) {
            config.logger.error(
                "Error fetching credentials from auth server",
                error
            );

            throw new ConfigError(
                `error fetching auth server URL: ${url}`,
                config
            );
        }

        if (!body || !body.access_token) {
            throw new ConfigError("token parse: invalid token", config);
        }

        return body;
    }
}
