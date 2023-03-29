/* eslint-disable @typescript-eslint/naming-convention */
import * as http from "http";
import assert from "node:assert";
import {AddressInfo} from "node:net";
import {Config} from "./Config";
import {LocalMetadataServiceCredentials} from "./LocalMetadataServiceCredentials";

describe(__filename, () => {
    let server: http.Server;

    beforeEach(async () => {
        server = http.createServer((req, res) => {
            res.end(
                JSON.stringify({
                    host: "https://test.com",
                    access_token: "XXXX",
                    expires_on: Math.floor(Date.now() / 1000) + 30,
                    token_type: "Bearer",
                })
            );
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
        const lmsCredentials = new LocalMetadataServiceCredentials();
        const config = new Config({
            host: "https://test.com",
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
        const lmsCredentials = new LocalMetadataServiceCredentials();
        const config = new Config({
            localMetadataServiceUrl: `http://localhost:${
                (server.address() as AddressInfo).port
            }`,
        });
        await lmsCredentials.configure(config);

        assert.equal(config.host, "https://test.com/");
    });
});
