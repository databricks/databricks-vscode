/* eslint-disable @typescript-eslint/naming-convention */
import * as http from "http";
import assert from "node:assert";
import {AddressInfo} from "node:net";
import {Config} from "./Config";
import {
    MetadataServiceCredentials,
    MetadataServiceVersion,
    MetadataServiceVersionHeader,
    ServerResponse,
} from "./MetadataServiceCredentials";

describe(__filename, () => {
    let server: http.Server;

    beforeEach(async () => {
        server = http.createServer((req, res) => {
            if (
                req.headers[
                    MetadataServiceVersionHeader.toLocaleLowerCase()
                ] !== MetadataServiceVersion
            ) {
                res.writeHead(400);
                res.end();
                return;
            }

            const response: ServerResponse = {
                host: "https://test.com",
                token: {
                    access_token: "XXXX",
                    expiry: new Date(Date.now() + 1_000),
                    token_type: "Bearer",
                },
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

        assert.equal(headers["Authorization"], "Bearer XXXX");
    });

    it("should not take host from metadata if not configured in config", async () => {
        const lmsCredentials = new MetadataServiceCredentials();
        const config = new Config({
            authType: "metadata-service",
            localMetadataServiceUrl: `http://localhost:${
                (server.address() as AddressInfo).port
            }`,
        });
        await lmsCredentials.configure(config);

        assert.equal(config.host, "https://test.com/");
    });
});
