import assert from "node:assert";
import {CredentialsProviderError} from "./types";
import {fromToken} from "./fromToken";

describe(__filename, () => {
    let origEnv: any;
    beforeEach(() => {
        origEnv = process.env;
        process.env = {};
    });

    afterEach(() => {
        process.env = origEnv;
    });

    it("should load config from environment variables", async () => {
        process.env["DATABRICKS_HOST"] = "https://cloud.databricks.com/";
        process.env["DATABRICKS_TOKEN"] = "dapitest1234";

        const provider = fromToken();
        const credentials = await provider();

        assert.equal(credentials.host.href, "https://cloud.databricks.com/");
        assert.equal(credentials.token, "dapitest1234");
    });

    it("should alow for passing in values", async () => {
        const provider = fromToken(
            new URL("https://cloud.databricks.com/"),
            "dapitest1234"
        );
        const credentials = await provider();

        assert.equal(credentials.host.href, "https://cloud.databricks.com/");
        assert.equal(credentials.token, "dapitest1234");
    });

    it("should throw if environment variables are not set", async () => {
        const provider = fromToken();

        assert.rejects(async () => {
            await provider();
        }, CredentialsProviderError);
    });
});
