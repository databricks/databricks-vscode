/* eslint-disable @typescript-eslint/naming-convention */

import assert from "node:assert";
import {
    HostParsingError,
    isConfigFileParsingError,
    loadConfigFile,
    Profile,
    resolveConfigFilePath,
    TokenParsingError,
} from "./configFile";
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
            assert.ok(!isConfigFileParsingError(profiles.DEFAULT));
            assert.equal(
                profiles.DEFAULT.host.href,
                "https://cloud.databricks.com/"
            );
            assert.equal(profiles.DEFAULT.token, "dapitest1234");

            assert.ok(!isConfigFileParsingError(profiles.STAGING));
            assert.equal(
                profiles.STAGING.host.href,
                "https://staging.cloud.databricks.com/"
            );
            assert.equal(profiles.STAGING.token, "dapitest54321");
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
            assert.ok(!isConfigFileParsingError(profiles.DEFAULT));
            assert.equal(
                profiles.DEFAULT.host.href,
                "https://cloud.databricks.com/"
            );
            assert.equal(profiles.DEFAULT.token, "dapitest1234");

            assert.ok(!isConfigFileParsingError(profiles.STAGING));
            assert.equal(
                profiles.STAGING.host.href,
                "https://staging.cloud.databricks.com/"
            );
            assert.equal(profiles.STAGING.token, "dapitest54321");
        });
    });

    it("should support profiles with username/password where user name is 'token'", async () => {
        await withFile(async ({path}) => {
            await writeFile(
                path,
                `[WITH_USERNAME]
host = https://cloud.databricks.com/
username = token
password = dapitest54321

[WITH_TOKEN]
host = https://staging.cloud.databricks.com/
token = dapitest54321
`
            );

            const profiles = await loadConfigFile(path);
            assert.equal(Object.keys(profiles).length, 2);
            for (const profile of Object.values(profiles)) {
                assert(!(profile instanceof TokenParsingError));
                assert.equal((profile as Profile).token, "dapitest54321");
            }
        });
    });

    it("should load all valid profiles and return errors for rest", async () => {
        await withFile(async ({path}) => {
            await writeFile(
                path,
                `[correct]
host = https://cloud.databricks.com/
token = dapitest1234

[no-host]
token = dapitest54321

[wrong-host]
host = wrong
token = dapitest54321

[no-token]
host = https://cloud.databricks.com/

[missing-host-token]
nothing = true
`
            );
            const profiles = await loadConfigFile(path);
            assert.equal(Object.keys(profiles).length, 5);
            assert.ok(!isConfigFileParsingError(profiles["correct"]));
            assert.deepEqual(profiles["correct"], {
                host: new URL("https://cloud.databricks.com/"),
                token: "dapitest1234",
            });

            assert.ok(isConfigFileParsingError(profiles["no-host"]));
            assert.deepEqual(
                profiles["no-host"],
                new HostParsingError('"host" it not defined')
            );

            assert.ok(isConfigFileParsingError(profiles["wrong-host"]));
            assert.ok(profiles["wrong-host"] instanceof HostParsingError);

            assert.ok(isConfigFileParsingError(profiles["no-token"]));
            assert.deepEqual(
                profiles["no-token"],
                new TokenParsingError('"token" it not defined')
            );

            assert.ok(isConfigFileParsingError(profiles["missing-host-token"]));
            assert.deepEqual(
                profiles["missing-host-token"],
                new HostParsingError('"host" it not defined')
            );
        });
    });
});
