/* eslint-disable @typescript-eslint/naming-convention */
import ".";
import assert from "node:assert";
import {ApiClient} from "./api-client";
import {Config} from ".";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sdkVersion = require("../package.json").version;

describe(__filename, () => {
    beforeEach(() => {
        delete process.env.DATABRICKS_CONFIG_FILE;
    });

    it("should create proper user agent", () => {
        const ua = new ApiClient(
            new Config({
                authType: "pat",
            }),
            {
                product: "unit",
                productVersion: "3.4.5",
            }
        ).userAgent();
        assert.equal(
            ua,
            `unit/3.4.5 databricks-sdk-js/${sdkVersion} nodejs/${process.version.slice(
                1
            )} os/${process.platform} auth/pat`
        );
    });

    it("should properly flatten query parameters", () => {
        const params = ApiClient.prepareQueryParams({
            a: 1,
            b: "2",
            c: {
                d: 3,
                e: {
                    f: [4, 5],
                },
            },
        });
        assert.deepEqual(params.toString(), "a=1&b=2&c.d=3&c.e.f=4&c.e.f=5");
    });
});
