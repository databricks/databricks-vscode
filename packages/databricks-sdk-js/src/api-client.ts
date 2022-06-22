/* eslint-disable @typescript-eslint/naming-convention */
import fetch from "node-fetch";
//import {Event, EventEmitter} from "vscode";

type HttpMethod = "POST" | "GET";

export class ApiClient {
    private host!: string;
    private token!: string;

    constructor(host: string, token: string) {
        this.updateConfiguration(host, token);
    }

    updateConfiguration(host: string, token: string) {
        this.host = host;
        this.token = token;
    }

    async request(
        path: string,
        method: HttpMethod,
        payload?: any
    ): Promise<Object> {
        const headers = {
            "Authorization": `Bearer ${this.token}`,
            "User-Agent": `vscode-notebook`,
            "Content-Type": "text/json",
        };

        let url = new URL(this.host);
        url.pathname = path;

        let options: any = {
            method,
            headers,
        };

        if (payload) {
            if (method === "POST") {
                options.body = JSON.stringify(payload);
            } else {
                url.search = new URLSearchParams(payload).toString();
            }
        }

        let response = (await (
            await fetch(url.toString(), options)
        ).json()) as any;

        // TODO proper error handling
        if ("error" in response) {
            throw new Error(response.error);
        }

        return response as any;
    }
}
