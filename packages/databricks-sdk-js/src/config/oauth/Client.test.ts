/* eslint-disable @typescript-eslint/naming-convention */
import assert from "assert";
import {when, spy, anything, verify, capture} from "ts-mockito";

import {Client, ClientOptions} from "./Client";
import {OidcEndpoints} from "./OidcEndpoints";
import {Token} from "../Token";
import {Config} from "../Config";

describe(__filename, () => {
    const issuer = new OidcEndpoints(
        new Config({
            host: "https://example.com",
            isAzure: () => false,
            isAccountClient: () => false,
            accountId: undefined,
        }),
        new URL("https://example.com/authorize"),
        new URL("https://example.com/token")
    );

    const options: ClientOptions = {
        clientId: "client-id",
        clientSecret: "client-secret",
    };

    describe("constructor", () => {
        it("should create an instance of Client", () => {
            const client = new Client(issuer, options);
            assert.ok(client instanceof Client);
        });

        it("should set default options", () => {
            const clientWithOptions = new Client(issuer, {
                clientId: "client-id",
                clientSecret: "client-secret",
            });
            assert.deepStrictEqual((clientWithOptions as any).options, {
                clientId: "client-id",
                clientSecret: "client-secret",
                useParams: false,
                useHeader: false,
                headers: {},
            });
        });
    });

    describe("grant", () => {
        it("should not send secrets by default", async () => {
            const client = new Client(issuer, options);
            const clientSpy = spy(client as any);
            when(clientSpy.fetch(anything(), anything())).thenResolve({
                json: () =>
                    Promise.resolve({
                        access_token: "access-token",
                        expires_in: 3600,
                    }),
                ok: true,
                headers: new Map<string, string>(),
            } as any);

            await client.grant("scope");

            verify(
                clientSpy.fetch("https://example.com/token", anything())
            ).once();
        });

        it("should return a token", async () => {
            const client = new Client(issuer, options);
            const clientSpy = spy(client as any);
            when(clientSpy.fetch(anything(), anything())).thenResolve({
                json: () =>
                    Promise.resolve({
                        access_token: "access-token",
                        expires_in: 3600,
                    }),
                ok: true,
                headers: new Map<string, string>(),
            } as any);

            const token = await client.grant("scope");
            assert.ok(token instanceof Token);
            assert.equal(token.accessToken, "access-token");
            assert.ok(token.expiry);
        });

        it("should not send secrets in params if specified", async () => {
            const client = new Client(issuer, {
                ...options,
                useParams: true,
            });
            const clientSpy = spy(client as any);
            when(clientSpy.fetch(anything(), anything())).thenCall(async () => {
                return {
                    json: () =>
                        Promise.resolve({
                            access_token: "access-token",
                            expires_in: 3600,
                        }),
                    ok: true,
                    headers: new Map<string, string>(),
                } as any;
            });

            await client.grant("scope");

            const [url, requestOptions] = capture(clientSpy.fetch).last();
            assert.equal(url, "https://example.com/token");
            assert.equal(
                (requestOptions as any)?.body.toString(),
                "grant_type=client_credentials&scope=scope&client_id=client-id&client_secret=client-secret"
            );
        });

        it("should use headers if specified", async () => {
            const clientWithHeaders = new Client(issuer, {
                ...options,
                useHeader: true,
            });

            const clientSpy = spy(clientWithHeaders as any);
            when(clientSpy.fetch(anything(), anything())).thenCall(async () => {
                return {
                    json: () =>
                        Promise.resolve({
                            access_token: "access-token",
                            expires_in: 3600,
                        }),
                    ok: true,
                    headers: new Map<string, string>(),
                } as any;
            });

            await clientWithHeaders.grant("scope");

            const [url, requestOptions] = capture(clientSpy.fetch).last();
            assert.equal(url, "https://example.com/token");
            assert.equal(
                (requestOptions as any)?.headers["Authorization"],
                "Basic Y2xpZW50LWlkOmNsaWVudC1zZWNyZXQ="
            );
        });
    });
});
