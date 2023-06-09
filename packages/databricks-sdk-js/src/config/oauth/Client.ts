/* eslint-disable @typescript-eslint/naming-convention */
import {Token} from "../Token";
import {OidcEndpoints} from "./OidcEndpoints";
import {Headers, fetch, RequestInit} from "../../fetch";
import {getBasicAuthHeader} from "../BasicCredentials";

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

    async grant(scope: string): Promise<Token> {
        const params: Record<string, string> = {
            grant_type: "client_credentials",
            scope,
        };

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

        requestOptions.body = new URLSearchParams(params).toString();

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
            typeof tokenSet.expires_in !== "number"
        ) {
            throw new Error(
                `Failed to retrieve token: ${JSON.stringify(tokenSet)}`
            );
        }

        return new Token({
            accessToken: tokenSet.access_token!,
            expiry: Date.now() + tokenSet.expires_in! * 1000,
        });
    }

    private fetch(url: string, options: RequestInit): ReturnType<typeof fetch> {
        return fetch(url, options);
    }
}
