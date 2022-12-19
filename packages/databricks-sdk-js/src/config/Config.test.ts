/* eslint-disable @typescript-eslint/naming-convention */
import assert from "node:assert";
import {AuthType, Config} from "./Config";
import {NamedLogger} from "../logging";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const testData = require("./testdata/unified-auth-cases.json");

describe(__dirname, () => {
    let envBackup: Record<string, string | undefined>;

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
            it.only(testCase.name, async () => {
                await apply(testCase);
            });
        } else if (testCase.skip) {
            it.skip(testCase.name, async () => {});
        } else {
            it(testCase.name, async () => {
                await apply(testCase);
            });
        }
    }

    async function configureProviderAndReturnConfig(
        cf: Partial<ConfigFixture>
    ): Promise<Config> {
        const config = new Config({
            host: cf.host,
            token: cf.token,
            username: cf.username,
            password: cf.password,
            profile: cf.profile,
            azureClientId: cf.azureClientId,
            azureClientSecret: cf.azureClientSecret,
            azureTenantId: cf.azureTenantId,
            azureResourceId: cf.azureResourceId,
            authType: cf.authType as AuthType,
            logger: console as unknown as NamedLogger,
        });

        await config.authenticate({});
        return config;
    }

    async function apply(cf: any) {
        let config: Config;
        for (const key of Object.keys(cf)) {
            cf[GoToJavaScript[key]] = cf[key];
        }

        for (const envName of Object.keys(cf.env || {})) {
            process.env[envName] = cf.env![envName];
        }

        try {
            config = await configureProviderAndReturnConfig(cf);
        } catch (error: any) {
            if (cf.assertError !== "") {
                assert.equal(
                    error.message.replace(__dirname + "/", ""),
                    cf.assertError
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

interface ConfigFixture {
    host: string;
    token: string;
    username: string;
    password: string;
    configFile: string;
    profile: string;
    azureClientId: string;
    azureClientSecret: string;
    azureTenantId: string;
    azureResourceId: string;
    authType: string;
    assertError: string;
    assertAuth: string;
    assertHost: string;
    assertAzure: boolean;
}

const GoToJavaScript: Record<string, string> = {
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
