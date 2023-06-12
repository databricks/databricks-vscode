/* eslint-disable @typescript-eslint/naming-convention */
import assert from "assert";
import {when, spy, anything} from "ts-mockito";

import {OidcEndpoints} from "./OidcEndpoints";
import {Client} from "./Client";
import {Config} from "../Config";

describe(__filename, () => {
    const config = new Config({
        host: "https://example.com",
        isAzure: () => false,
        isAccountClient: () => false,
        accountId: undefined,
    });

    const authorizationEndpoint = new URL("https://example.com/authorize");
    const tokenEndpoint = new URL("https://example.com/token");

    describe("constructor", () => {
        const endpoints = new OidcEndpoints(
            config,
            authorizationEndpoint,
            tokenEndpoint
        );
        it("should create an instance of Issuer", () => {
            assert.ok(endpoints instanceof OidcEndpoints);
        });
    });

    describe("getClient", () => {
        const endpoints = new OidcEndpoints(
            config,
            authorizationEndpoint,
            tokenEndpoint
        );
        it("should return an instance of Client", () => {
            const client = endpoints.getClient({
                clientId: "client-id",
                clientSecret: "client-secret",
            });
            assert.ok(client instanceof Client);
        });
    });

    describe("discover", () => {
        it("should return undefined if config.host is not set", async () => {
            const config = new Config({});
            const result = await config.getOidcEndpoints();

            assert.strictEqual(result, undefined);
        });

        it("should return an instance of Issuer for Azure", async () => {
            const response = {
                headers: {
                    location: "https://example.com/real-auth-url/authorize",
                },
            };

            const cfg = new Config({
                ...config,
            });
            when(spy(cfg as any).fetch(anything(), anything())).thenResolve(
                response as any
            );

            cfg.isAzure = () => true;
            const result = await cfg.getOidcEndpoints();

            assert.ok(result instanceof OidcEndpoints);
            assert.deepStrictEqual(
                result.authorizationEndpoint.href,
                "https://example.com/real-auth-url/authorize"
            );
            assert.deepStrictEqual(
                result.tokenEndpoint.href,
                "https://example.com/real-auth-url/token"
            );
        });

        it("should return an instance for a workspace client", async () => {
            const cfg = new Config({
                ...config,
            });
            const response = {
                status: 200,
                json: async () => ({
                    authorization_endpoint: "https://example.com/authorize",
                    token_endpoint: "https://example.com/token",
                }),
            };

            when(spy(cfg as any).fetch(anything(), anything())).thenResolve(
                response as any
            );

            const result = await cfg.getOidcEndpoints();

            assert.ok(result instanceof OidcEndpoints);
            assert.deepStrictEqual(
                result.authorizationEndpoint,
                new URL("https://example.com/authorize")
            );
            assert.deepStrictEqual(
                result.tokenEndpoint,
                new URL("https://example.com/token")
            );
        });

        it("should return an instance of Issuer for account client", async () => {
            const cfg = new Config({
                ...config,
                isAccountClient: () => true,
                accountId: "123",
            });

            const result = await cfg.getOidcEndpoints();

            assert.ok(result instanceof OidcEndpoints);
            assert.deepStrictEqual(
                result.authorizationEndpoint,
                new URL("https://example.com/oidc/accounts/123/v1/authorize")
            );
            assert.deepStrictEqual(
                result.tokenEndpoint,
                new URL("https://example.com/oidc/accounts/123/v1/token")
            );
        });
    });
});
