import {Config} from "../Config";
import {Client, ClientOptions} from "./Client";
import fetch from "node-fetch-commonjs";

export class Issuer {
    constructor(
        public readonly config: Config,
        public readonly authorizationEndpoint: URL,
        public readonly tokenEndpoint: URL
    ) {}

    getClient(options: ClientOptions): Client {
        return new Client(this, options);
    }

    static async discover(config: Config): Promise<Issuer | undefined> {
        if (!config.host) {
            return;
        }

        if (config.isAzure()) {
            const response = await this.fetch(
                `${config.host}/oidc/oauth2/v2.0/authorize`,
                {}
            );

            const realAuthUrl = response.headers.get("location");
            if (!realAuthUrl) {
                return;
            }

            return new Issuer(
                config,
                new URL(realAuthUrl),
                new URL(realAuthUrl.replace("/authorize", "/token"))
            );
        }

        if (config.isAccountClient() && config.accountId) {
            const prefix = `${config.host}/oidc/accounts/${config.accountId}`;
            return new Issuer(
                config,
                new URL(`${prefix}/v1/authorize`),
                new URL(`${prefix}/v1/token`)
            );
        }

        const oidcEndpoint = `${config.host}/oidc/.well-known/oauth-authorization-server`;
        const response = await this.fetch(oidcEndpoint, {});
        if (response.status !== 200) {
            return;
        }

        const json = (await response.json()) as any;
        if (
            !json ||
            typeof json.authorization_endpoint !== "string" ||
            typeof json.token_endpoint !== "string"
        ) {
            return;
        }

        return new Issuer(
            config,
            new URL(json.authorization_endpoint),
            new URL(json.token_endpoint)
        );
    }

    private static async fetch(
        url: string,
        options: any
    ): ReturnType<typeof fetch> {
        return await fetch(url, options);
    }
}
