/* eslint-disable @typescript-eslint/naming-convention */
import fetch from "node-fetch";
import * as https from "node:https";
import {TextDecoder} from "node:util";
import {fromDefaultChain} from "./auth/fromChain";

const sdkVersion = require("../package.json").version;

type HttpMethod = "POST" | "GET" | "DELETE" | "PATCH";

export class HttpError extends Error {
    constructor(
        readonly message: string,
        readonly code: number,
        readonly json?: any
    ) {
        super(message);
    }
}

export class ApiClient {
    private agent: https.Agent;

    constructor(
        private readonly product: string,
        private readonly productVersion: string,
        private credentialProvider = fromDefaultChain
    ) {
        this.agent = new https.Agent({
            keepAlive: true,
            keepAliveMsecs: 15_000,
        });
    }

    userAgent(): string {
        let pairs = [
            `${this.product}/${this.productVersion}`,
            `databricks-sdk-js/${sdkVersion}`,
            `nodejs/${process.version.slice(1)}`,
            `os/${process.platform}`,
        ];
        // TODO: add ability of per-request extra-information,
        // so that we can track sub-functionality, like in Terraform
        return pairs.join(" ");
    }

    async request(
        path: string,
        method: HttpMethod,
        payload?: any
    ): Promise<Object> {
        const credentials = await this.credentialProvider();
        const headers = {
            "Authorization": `Bearer ${credentials.token}`,
            "User-Agent": this.userAgent(),
            "Content-Type": "text/json",
        };

        let url = credentials.host;
        url.pathname = path;

        let options: any = {
            method,
            headers,
            agent: this.agent,
        };

        if (payload) {
            if (method === "POST") {
                options.body = JSON.stringify(payload);
            } else {
                url.search = new URLSearchParams(payload).toString();
            }
        }

        let response;

        try {
            response = await fetch(url.toString(), options);
        } catch (e: any) {
            if (e.code && e.code === "ENOTFOUND") {
                throw new HttpError(`Can't connect to ${url.toString()}`, 500);
            } else {
                throw e;
            }
        }

        // throw error if the URL is incorrect and we get back an HTML page
        if (response.headers.get("content-type")?.match("text/html")) {
            throw new HttpError(`Can't connect to ${url.toString()}`, 404);
        }

        let responseBody = await response.arrayBuffer();
        let responseText = new TextDecoder().decode(responseBody);

        // TODO proper error handling
        if (!response.ok) {
            if (responseText.match(/invalid access token/i)) {
                throw new HttpError("Invalid access token", response.status);
            } else {
                throw new HttpError(responseText, response.status);
            }
        }

        try {
            response = JSON.parse(responseText);
        } catch (e) {
            throw new Error(responseText);
        }

        if ("error" in response) {
            throw new Error(response.error);
        }

        if ("error_code" in response) {
            let message =
                response.message || `HTTP error ${response.error_code}`;
            throw new HttpError(message, response.error_code, response);
        }

        return response as any;
    }
}
