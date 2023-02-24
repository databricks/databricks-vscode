/* eslint-disable @typescript-eslint/naming-convention */
import assert from "node:assert";
import {Config, ConfigOptions} from "./Config";
import {NamedLogger} from "../logging";
import path from "node:path";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const testData = require("./testdata/unified-auth-cases.json");

/**
 * Test runner for the unified auth test cases in `testdata/unified-auth-cases.json`.
 *
 * Run a single test case:
 * Add a `only: true` property to the test case in `testdata/unified-auth-cases.json`.
 *
 * Skip a test case:
 * Add a `skip: true` property to the test case in `testdata/unified-auth-cases.json`.
 */
describe(__dirname, function () {
    let envBackup: Record<string, string | undefined>;
    const debug = false;

    beforeEach(() => {
        envBackup = process.env;
        process.env = {};
        process.chdir(__dirname);
    });

    afterEach(() => {
        process.env = envBackup;
    });

    for (const testCase of testData.testCases) {
        if (testCase.only) {
            // eslint-disable-next-line no-only-tests/no-only-tests
            it.only(testCase.name, async function () {
                this.timeout(10_000);
                await apply(testCase);
            });
        } else if (testCase.skip) {
            it.skip(testCase.name, async () => {});
        } else {
            it(testCase.name, async function () {
                this.timeout(10_000);
                await apply(testCase);
            });
        }
    }

    async function configureProviderAndReturnConfig(
        cf: Partial<ConfigFixture>
    ): Promise<Config> {
        const config = new Config({
            ...cf,
            logger: debug ? (console as unknown as NamedLogger) : undefined,
        });

        await config.authenticate({});
        return config;
    }

    async function apply(cf: any) {
        let config: Config;
        for (const key of Object.keys(cf)) {
            cf[ConfigToAttribute[key]] = cf[key];
        }

        for (const envName of Object.keys(cf.env || {})) {
            if (envName === "PATH" && cf.env![envName].indexOf("$PATH") >= 0) {
                process.env[envName] = cf
                    .env![envName].replace(/:/g, path.delimiter)
                    .replace("$PATH", envBackup.PATH || "");
            } else {
                process.env[envName] = cf.env![envName];
            }
        }

        if (!cf.env || !cf.env["HOME"]) {
            process.env["HOME"] = "i-dont-exist";
        }

        try {
            config = await configureProviderAndReturnConfig(cf);
        } catch (error: any) {
            if (cf.assertError) {
                assert.equal(
                    error.message
                        .replace(/\r?\n/g, "\n") // normalize line endings between windows and unix
                        .replace(__dirname + path.sep, "") // make paths relative
                        .replace(/\\/g, "/"), // normalize path separators
                    cf.assertError.replace()
                );
                return;
            }
            throw error;
        }
        if (cf.assertAzure !== undefined) {
            assert.equal(cf.assertAzure, config.isAzure());
        }
        assert.equal(cf.assertAuth, config.authType);
        assert.equal(`https://${new URL(cf.assertHost).hostname}`, config.host);
    }
});

interface ConfigFixture extends ConfigOptions {
    assertError: string;
    assertAuth: string;
    assertHost: string;
    assertAzure: boolean;
}

const ConfigToAttribute: Record<string, string> = {
    host: "host",
    token: "token",
    username: "username",
    password: "password",
    config_file: "configFile",
    profile: "profile",
    azure_resource_id: "azureResourceId",
    auth_type: "authType",
    env: "env",
    assert_error: "assertError",
    assert_auth: "assertAuth",
    assert_host: "assertHost",
    assert_azure: "assertAzure",
};
