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
                product: "unit",
                productVersion: "3.4.5",
                authType: "pat",
            })
        ).userAgent();
        assert.equal(
            ua,
            `unit/3.4.5 databricks-sdk-js/${sdkVersion} auth/pat nodejs/${process.version.slice(
                1
            )} os/${process.platform}`
        );
    });
});
