/* eslint-disable @typescript-eslint/naming-convention */
import * as http from "http";
import assert from "node:assert";
import {AddressInfo} from "node:net";
import {Config} from "./Config";
import {
    MetadataServiceCredentials,
    MetadataServiceHostHeader,
    MetadataServiceVersion,
    MetadataServiceVersionHeader,
    ServerResponse,
} from "./MetadataServiceCredentials";

describe(__filename, () => {
    let server: http.Server;

    beforeEach(async () => {
        let i = 0;
        server = http.createServer((req, res) => {
            if (
                req.headers[MetadataServiceVersionHeader] !==
                MetadataServiceVersion
            ) {
                res.writeHead(400);
                res.end();
                return;
            }

            if (req.headers[MetadataServiceHostHeader] !== "https://test.com") {
                res.writeHead(404);
                res.end();
                return;
            }

            const response: ServerResponse = {
                access_token: `XXXX-${i++}`,
                expires_on: Math.floor(
                    new Date(Date.now() + 1_000).getTime() / 1000
                ),
                token_type: "Bearer",
            };
            res.end(JSON.stringify(response));
        });

        await new Promise((resolve, reject) => {
            server.listen(0, "127.0.0.1", () => {
                resolve(null);
            });
            server.on("error", (err) => {
                reject(err);
            });
        });
    });

    afterEach(async () => {
        await new Promise((resolve) => {
            server.close(() => {
                resolve(null);
            });
        });
    });

    it("should authorize using local server", async () => {
        const lmsCredentials = new MetadataServiceCredentials();
        const config = new Config({
            host: "https://test.com",
            authType: "metadata-service",
            localMetadataServiceUrl: `http://localhost:${
                (server.address() as AddressInfo).port
            }`,
        });
        const visitor = await lmsCredentials.configure(config);
        assert.ok(visitor);
        const headers: Record<string, string> = {};
        await visitor(headers);

        assert.equal(headers["Authorization"], "Bearer XXXX-1");
    });

    it("should check host", async () => {
        const lmsCredentials = new MetadataServiceCredentials();
        const config = new Config({
            host: "https://test2.com",
            authType: "metadata-service",
            localMetadataServiceUrl: `http://localhost:${
                (server.address() as AddressInfo).port
            }`,
        });
        const visitor = await lmsCredentials.configure(config);
        assert.ok(!visitor);
    });

    it("should refresh credentials", async () => {
        const lmsCredentials = new MetadataServiceCredentials();
        const config = new Config({
            host: "https://test.com",
            authType: "metadata-service",
            localMetadataServiceUrl: `http://localhost:${
                (server.address() as AddressInfo).port
            }`,
        });

        const visitor = await lmsCredentials.configure(config);
        assert.ok(visitor);

        const headers: Record<string, string> = {};
        await visitor(headers);
        assert.equal(headers["Authorization"], "Bearer XXXX-1");

        // expires immediately since expiery is lower than expiryDelta
        await visitor(headers);
        assert.equal(headers["Authorization"], "Bearer XXXX-2");
    });
});
