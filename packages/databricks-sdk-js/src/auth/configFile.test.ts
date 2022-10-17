/* eslint-disable @typescript-eslint/naming-convention */

import assert from "node:assert";
import {loadConfigFile, resolveConfigFilePath} from "./configFile";
import {writeFile} from "node:fs/promises";
import {withFile} from "tmp-promise";
import {homedir} from "node:os";
import path from "node:path";

describe(__filename, () => {
    beforeEach(() => {
        delete process.env.DATABRICKS_CONFIG_FILE;
    });

    it("should load file from default location", () => {
        assert.equal(
            resolveConfigFilePath(),
            path.join(homedir(), ".databrickscfg")
        );
    });

    it("should load file location defined in environment variable", () => {
        process.env.DATABRICKS_CONFIG_FILE = "/tmp/databrickscfg.yml";
        assert.equal(resolveConfigFilePath(), "/tmp/databrickscfg.yml");
    });

    it("should load file from passed in location", () => {
        assert.equal(
            resolveConfigFilePath("/tmp/.databrickscfg"),
            "/tmp/.databrickscfg"
        );
    });

    it("should parse a config file w/o DEFAULT header", async () => {
        await withFile(async ({path}) => {
            await writeFile(
                path,
                `
host = https://cloud.databricks.com/
token = dapitest1234

[STAGING]
host = https://staging.cloud.databricks.com/
token = dapitest54321
`
            );

            const profiles = await loadConfigFile(path);

            assert.equal(Object.keys(profiles).length, 2);
            assert.equal(
                profiles.DEFAULT.value?.host.href,
                "https://cloud.databricks.com/"
            );
            assert.equal(profiles.DEFAULT.value?.token, "dapitest1234");
            assert.equal(
                profiles.STAGING.value?.host.href,
                "https://staging.cloud.databricks.com/"
            );
            assert.equal(profiles.STAGING.value?.token, "dapitest54321");
        });
    });

    it("should parse a config file with DEFAULT header", async () => {
        await withFile(async ({path}) => {
            await writeFile(
                path,
                `[DEFAULT]
host = https://cloud.databricks.com/
token = dapitest1234

[STAGING]
host = https://staging.cloud.databricks.com/
token = dapitest54321
`
            );

            const profiles = await loadConfigFile(path);

            assert.equal(Object.keys(profiles).length, 2);
            assert.equal(
                profiles.DEFAULT.value?.host.href,
                "https://cloud.databricks.com/"
            );
            assert.equal(profiles.DEFAULT.value?.token, "dapitest1234");
            assert.equal(
                profiles.STAGING.value?.host.href,
                "https://staging.cloud.databricks.com/"
            );
            assert.equal(profiles.STAGING.value?.token, "dapitest54321");
        });
    });
});
