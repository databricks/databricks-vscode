import assert = require("node:assert");
import {writeFile} from "node:fs/promises";
import {withFile} from "tmp-promise";
import {DEFAULT_PROFILE, fromConfigFile} from "./fromConfigFile";

describe(__dirname, () => {
    it("should load from config file", async () => {
        await withFile(async ({path}) => {
            await writeFile(
                path,
                `[DEFAULT]
host = https://cloud.databricks.com/
token = dapitest1234 `
            );

            const provider = fromConfigFile(DEFAULT_PROFILE, path);
            const credentials = await provider();
            assert.equal(
                credentials.host.href,
                "https://cloud.databricks.com/"
            );
            assert.equal(credentials.token, "dapitest1234");
        });
    });

    it("should load non DEFAULT profile from config file", async () => {
        await withFile(async ({path}) => {
            await writeFile(
                path,
                `[DEFAULT]
host = https://cloud.databricks.com/
token = dapitest1234

[STAGING]
host = https://staging.cloud.databricks.com/
token = dapitest54321`
            );

            const provider = fromConfigFile("STAGING", path);
            const credentials = await provider();
            assert.equal(
                credentials.host.href,
                "https://staging.cloud.databricks.com/"
            );
            assert.equal(credentials.token, "dapitest54321");
        });
    });
});

//let stub = sinon.stub(process.env, 'FOO').value('bar');
