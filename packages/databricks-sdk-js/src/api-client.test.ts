/* eslint-disable @typescript-eslint/naming-convention */
import ".";
import assert from "node:assert";
import {ApiClient} from "./api-client";

const sdkVersion = require("../package.json").version;

describe(__filename, () => {
    beforeEach(() => {
        delete process.env.DATABRICKS_CONFIG_FILE;
    });

    it("should create proper user agent", () => {
        let ua = new ApiClient("unit", "3.4.5").userAgent();
        assert.equal(
            ua,
            `unit/3.4.5 databricks-sdk-js/${sdkVersion} nodejs/${process.version.slice(
                1
            )} os/${process.platform}`
        );
    });
});
