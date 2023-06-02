/* eslint-disable @typescript-eslint/naming-convention */
import assert from "assert";
import {when, spy, anything} from "ts-mockito";

import {Issuer} from "./Issuer";
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

    const issuer = new Issuer(config, authorizationEndpoint, tokenEndpoint);

    describe("constructor", () => {
        it("should create an instance of Issuer", () => {
            assert.ok(issuer instanceof Issuer);
        });
    });

    describe("getClient", () => {
        it("should return an instance of Client", () => {
            const client = issuer.getClient({
                clientId: "client-id",
                clientSecret: "client-secret",
            });
            assert.ok(client instanceof Client);
        });
    });

    describe("discover", () => {
        it("should return undefined if config.host is not set", async () => {
            const result = await Issuer.discover(new Config({}));

            assert.strictEqual(result, undefined);
        });

        it("should return an instance of Issuer for Azure", async () => {
            const response = {
                headers: new Map<string, string>([
                    ["location", "https://example.com/real-auth-url"],
                ]),
            };

            when(spy(Issuer as any).fetch(anything(), anything())).thenResolve(
                response as any
            );

            const result = await Issuer.discover(
                new Config({
                    ...config,
                    isAzure: () => true,
                })
            );

            assert.ok(result instanceof Issuer);
            assert.deepStrictEqual(
                result.authorizationEndpoint,
                new URL("https://example.com/real-auth-url")
            );
            assert.deepStrictEqual(
                result.tokenEndpoint,
                new URL("https://example.com/real-auth-url/token")
            );
        });

        it("should return an instance for a workspace client", async () => {
            const response = {
                status: 200,
                json: async () => ({
                    authorization_endpoint: "https://example.com/authorize",
                    token_endpoint: "https://example.com/token",
                }),
            };

            when(spy(Issuer as any).fetch(anything(), anything())).thenResolve(
                response as any
            );

            const result = await Issuer.discover(config);

            assert.ok(result instanceof Issuer);
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
            const result = await Issuer.discover(
                new Config({
                    ...config,
                    isAccountClient: () => true,
                    accountId: "123",
                })
            );

            assert.ok(result instanceof Issuer);
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
