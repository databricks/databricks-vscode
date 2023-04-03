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
export const MetadataServiceVersionHeader = "X-Databricks-Metadata-Version";

export interface ServerResponse {
    host?: string;
    token: {
        access_token: string;
        expiry: Date;
        token_type: string;
    };
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
 * The server is expected to return a JSON response with the following fields:
 *
 * host: URL of the Databricks host to connect to.
 * token: object with the following fields
 *   access_token: The requested access token.
 *	 token_type: The type of token, which is a "Bearer" access token.
 *	 expires_on: The timespan when the access token expires.
 */
export class MetadataServiceCredentials implements CredentialProvider {
    public name: AuthType = "metadata-service";

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

        const response = await this.makeRequest(
            config,
            parsedMetadataServiceUrl
        );

        if (!response) {
            return;
        }

        const configHost =
            config.host && (await (await config.getHost()).toString());

        if (configHost && configHost !== response.host) {
            config.logger.debug(
                `ignoring metadata service because it returned a token for a different host: ${configHost}`
            );
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

            config.logger.info(
                `Refreshed access token from local credentials server, which expires on ${serverResponse.token.expiry}`
            );

            return new Token({
                accessToken: serverResponse.token.access_token,
                expiry: Math.floor(
                    serverResponse.token.expiry.getTime() / 1000
                ),
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

        if (!body || !body.host || !body.token?.access_token) {
            throw new ConfigError("token parse: invalid token", config);
        }

        try {
            const parsedHost = new URL(body.host);
            body.host = parsedHost.toString();

            if (body.token.expiry) {
                body.token.expiry = new Date(body.token.expiry);
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
