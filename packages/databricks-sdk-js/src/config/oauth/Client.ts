/* eslint-disable @typescript-eslint/naming-convention */
import {Token} from "../Token";
import {OidcEndpoints} from "./OidcEndpoints";
import {Headers, fetch, RequestInit} from "../../fetch";
import {getBasicAuthHeader} from "../BasicCredentials";
import * as querystring from "querystring";

export interface ClientOptions {
    clientId: string;
    clientSecret: string;
    useParams?: boolean;
    useHeader?: boolean;
    headers?: Headers;
}

export class Client {
    constructor(private issuer: OidcEndpoints, private options: ClientOptions) {
        options.useParams = options.useParams ?? false;
        options.useHeader = options.useHeader ?? false;
        options.headers = options.headers ?? {};
    }

    async requestResource(
        url: URL,
        token: Token,
        requestOptions: RequestInit
    ): ReturnType<typeof fetch> {
        requestOptions.headers = {
            ...this.options.headers,
            Authorization: `Bearer ${token.accessToken}`,
        };

        return await this.fetch(url.toString(), requestOptions);
    }

    async grant(params: Record<string, string | string[]>): Promise<Token> {
        params.grant_type = "client_credentials";

        const requestOptions: RequestInit = {
            method: "POST",
            headers: this.options.headers,
        };

        if (this.options.useParams) {
            params["client_id"] = this.options.clientId;
            params["client_secret"] = this.options.clientSecret;
        } else if (this.options.useHeader) {
            requestOptions.headers = {
                ...requestOptions.headers,
                Authorization: getBasicAuthHeader(
                    this.options.clientId,
                    this.options.clientSecret
                ),
            };
        }

        requestOptions.headers = {
            ...requestOptions.headers,
            "Content-Type": "application/x-www-form-urlencoded",
        };
        requestOptions.body = querystring.stringify(params);

        const response = await this.fetch(
            this.issuer.tokenEndpoint.toString(),
            requestOptions
        );

        if (!response.ok) {
            if (
                response.headers["content-type"]?.includes("application/json")
            ) {
                const json = (await response.json()) as any;

                const code =
                    json.errorCode ||
                    json.error_code ||
                    json.error ||
                    "Unknown";

                const summary = (
                    json.errorSummary ||
                    json.error_description ||
                    "Unknown"
                ).replace(/\r?\n/g, " ");

                throw new Error(`Failed to retrieve token: ${code} ${summary}`);
            } else {
                throw new Error(
                    `Failed to retrieve token: ${response.status} ${response.statusText}`
                );
            }
        }

        const tokenSet = (await response.json()) as any;
        if (
            !tokenSet ||
            typeof tokenSet.access_token !== "string" ||
            (typeof tokenSet.expires_in !== "number" &&
                typeof tokenSet.expires_in !== "string")
        ) {
            throw new Error(
                `Failed to retrieve token: ${JSON.stringify(tokenSet)}`
            );
        }

        return new Token({
            accessToken: tokenSet.access_token!,
            expiry: Date.now() + parseInt(tokenSet.expires_in!) * 1000,
        });
    }

    private fetch(url: string, options: RequestInit): ReturnType<typeof fetch> {
        return fetch(url, options);
    }
}
