/* eslint-disable @typescript-eslint/naming-convention */
import assert from "node:assert";
import {Config} from "./Config";
import {file as tmpFile} from "tmp-promise";
import * as fs from "node:fs/promises";

describe(__dirname, () => {
    let tmp: string;
    let cleanup: () => Promise<void>;

    before(async () => {
        ({path: tmp, cleanup} = await tmpFile());
        await fs.writeFile(tmp, "");
    });

    after(async () => {
        await cleanup();
    });

    it("should fail with no params", async () => {
        await apply({
            assertError: "default auth: cannot configure default credentials",
        });
    });

    it("should fail with host only", async () => {
        await apply({
            host: "https://x",
            assertError: "default auth: cannot configure default credentials",
        });
    });

    it("should fail with token only", async () => {
        await apply({
            env: {
                DATABRICKS_TOKEN: "x",
            },
            assertError: "default auth: cannot configure default credentials",
        });
    });

    it("should use pat with host and token from env", async () => {
        await apply({
            env: {
                DATABRICKS_HOST: "https://x",
                DATABRICKS_TOKEN: "x",
            },
            assertAuth: "pat",
            assertHost: "https://x",
        });
    });

    it("should use pat with host from config and token from env", async () => {
        await apply({
            host: "https://y",
            env: {
                DATABRICKS_TOKEN: "x",
            },
            assertAuth: "pat",
            assertHost: "https://y",
        });
    });

    it("should fail basic auth with user name and password without password", async () => {
        await apply({
            env: {
                DATABRICKS_USERNAME: "x",
                DATABRICKS_PASSWORD: "x",
            },
            assertError: "default auth: cannot configure default credentials",
            assertHost: "https://x",
        });
    });

    it("should fail basic auth", async () => {
        await apply({
            env: {
                DATABRICKS_HOST: "x",
                DATABRICKS_USERNAME: "x",
                DATABRICKS_PASSWORD: "x",
            },
            assertAuth: "basic",
            assertHost: "https://x",
        });
    });

    it("should give precedence to environment variables", async () => {
        await apply({
            host: "y",
            env: {
                DATABRICKS_HOST: "x",
                DATABRICKS_USERNAME: "x",
                DATABRICKS_PASSWORD: "x",
            },
            assertAuth: "basic",
            assertHost: "https://x",
        });
    });

    it("should configure basic auth with mix from config and env", async () => {
        await apply({
            host: "y",
            username: "x",
            env: {
                DATABRICKS_PASSWORD: "x",
            },
            assertAuth: "basic",
            assertHost: "https://y",
        });
    });

    it("should configure basic auth from config", async () => {
        await apply({
            host: "y",
            username: "x",
            password: "x",
            assertAuth: "basic",
            assertHost: "https://y",
        });
    });

    it("should fail with conflicting auth methods", async () => {
        await apply({
            host: "y",
            username: "x",
            password: "x",
            token: "x",
            assertError:
                "validate: more than one authorization method configured: basic and pat",
        });
    });

    it("should define auth type through env", async () => {
        await apply({
            env: {
                DATABRICKS_HOST: "x",
                DATABRICKS_TOKEN: "x",
                DATABRICKS_USERNAME: "x",
                DATABRICKS_PASSWORD: "x",
            },
            authType: "basic",
            assertAuth: "basic",
            assertHost: "https://x",
        });
    });

    it("should fail with non existing config file", async () => {
        await apply({
            env: {
                DATABRICKS_CONFIG_FILE: "x",
            },
            assertError: "default auth: cannot configure default credentials",
        });
    });

    it("should load PAT from config file", async () => {
        await fs.writeFile(
            tmp,
            `[DEFAULT]
host = https://dbc-XXXXXXXX-YYYY.cloud.databricks.com
token = x`
        );
        await apply({
            assertHost: "https://dbc-xxxxxxxx-yyyy.cloud.databricks.com",
            assertAuth: "pat",
        });
    });

    it("should fail loading incomplete config", async () => {
        await fs.writeFile(
            tmp,
            `[nohost]
token = x`
        );
        await apply({
            assertError: "default auth: cannot configure default credentials",
        });
    });

    // func TestConfig_ConfigProfileAndToken(t *testing.T) {
    // 	configFixture{
    // 		env: map[string]string{
    // 			"DATABRICKS_TOKEN":          "x",
    // 			"DATABRICKS_CONFIG_PROFILE": "nohost",
    // 			"HOME":                      "testdata",
    // 		},
    // 		assertError: "default auth: cannot configure default credentials. " +
    // 			"Config: token=***, profile=nohost. Env: DATABRICKS_TOKEN, DATABRICKS_CONFIG_PROFILE",
    // 	}.apply(t)
    // }

    // func TestConfig_ConfigProfileAndPassword(t *testing.T) {
    // 	configFixture{
    // 		env: map[string]string{
    // 			"DATABRICKS_USERNAME":       "x",
    // 			"DATABRICKS_CONFIG_PROFILE": "nohost",
    // 			"HOME":                      "testdata",
    // 		},
    // 		assertError: "validate: more than one authorization method configured: basic and pat. Config: token=***, username=x, profile=nohost. Env: DATABRICKS_USERNAME, DATABRICKS_CONFIG_PROFILE",
    // 	}.apply(t)
    // }

    // var azResourceID = "/sub/rg/ws"

    // func TestConfig_AzurePAT(t *testing.T) {
    // 	configFixture{
    // 		// Azure hostnames can support host+token auth, as usual
    // 		host:        "https://adb-xxx.y.azuredatabricks.net/",
    // 		token:       "y",
    // 		assertAzure: true,
    // 		assertHost:  "https://adb-xxx.y.azuredatabricks.net",
    // 		assertAuth:  "pat",
    // 	}.apply(t)
    // }

    // func TestConfig_AzureCliHost(t *testing.T) {
    // 	configFixture{
    // 		host:            "x",          // adb-123.4.azuredatabricks.net
    // 		azureResourceID: azResourceID, // skips ensureWorkspaceUrl
    // 		env: map[string]string{
    // 			"PATH": testdataPath(),
    // 			"HOME": "testdata/azure",
    // 		},
    // 		assertAzure: true,
    // 		assertHost:  "https://x",
    // 		assertAuth:  "azure-cli",
    // 	}.apply(t)
    // }

    // func TestConfig_AzureCliHost_Fail(t *testing.T) {
    // 	configFixture{
    // 		azureResourceID: azResourceID,
    // 		env: map[string]string{
    // 			"PATH": testdataPath(),
    // 			"HOME": "testdata/azure",
    // 			"FAIL": "yes",
    // 		},
    // 		assertError: "default auth: azure-cli: cannot get access token: This is just a failing script.\n. Config: azure_workspace_resource_id=/sub/rg/ws",
    // 	}.apply(t)
    // }

    // func TestConfig_AzureCliHost_AzNotInstalled(t *testing.T) {
    // 	configFixture{
    // 		// `az` not installed, which is expected for deployers on other clouds...
    // 		azureResourceID: azResourceID,
    // 		env: map[string]string{
    // 			"PATH": "whatever",
    // 			"HOME": "testdata/azure",
    // 		},
    // 		assertError: "default auth: cannot configure default credentials. Config: azure_workspace_resource_id=/sub/rg/ws",
    // 	}.apply(t)
    // }

    // func TestConfig_AzureCliHost_PatConflict_WithConfigFilePresentWithoutDefaultProfile(t *testing.T) {
    // 	configFixture{
    // 		azureResourceID: azResourceID,
    // 		token:           "x",
    // 		env: map[string]string{
    // 			"PATH": testdataPath(),
    // 			"HOME": "testdata/azure",
    // 		},
    // 		assertError: "validate: more than one authorization method configured: azure and pat. Config: token=***, azure_workspace_resource_id=/sub/rg/ws",
    // 	}.apply(t)
    // }

    // func TestConfig_AzureCliHostAndResourceID(t *testing.T) {
    // 	configFixture{
    // 		// omit request to management endpoint to get workspace properties
    // 		azureResourceID: azResourceID,
    // 		host:            "x",
    // 		env: map[string]string{
    // 			"PATH": testdataPath(),
    // 			"HOME": "testdata/azure",
    // 		},
    // 		assertAzure: true,
    // 		assertHost:  "https://x",
    // 		assertAuth:  "azure-cli",
    // 	}.apply(t)
    // }

    // func TestConfig_AzureCliHostAndResourceID_ConfigurationPrecedence(t *testing.T) {
    // 	configFixture{
    // 		// omit request to management endpoint to get workspace properties
    // 		azureResourceID: azResourceID,
    // 		host:            "x",
    // 		env: map[string]string{
    // 			"PATH":                      testdataPath(),
    // 			"HOME":                      "testdata/azure",
    // 			"DATABRICKS_CONFIG_PROFILE": "justhost",
    // 		},
    // 		assertAzure: true,
    // 		assertHost:  "https://x",
    // 		assertAuth:  "azure-cli",
    // 	}.apply(t)
    // }

    // func TestConfig_AzureAndPasswordConflict(t *testing.T) { // TODO: this breaks
    // 	configFixture{
    // 		host:            "x",
    // 		azureResourceID: azResourceID,
    // 		env: map[string]string{
    // 			"PATH":                testdataPath(),
    // 			"HOME":                "testdata/azure",
    // 			"DATABRICKS_USERNAME": "x",
    // 		},
    // 		assertError: "validate: more than one authorization method configured: azure and basic. Config: host=x, username=x, azure_workspace_resource_id=/sub/rg/ws. Env: DATABRICKS_USERNAME",
    // 	}.apply(t)
    // }

    // func TestConfig_CorruptConfig(t *testing.T) {
    // 	configFixture{
    // 		env: map[string]string{
    // 			"HOME":                      "testdata/corrupt",
    // 			"DATABRICKS_CONFIG_PROFILE": "DEFAULT",
    // 		},
    // 		assertError: "resolve: testdata/corrupt/.databrickscfg has no DEFAULT profile configured. Config: profile=DEFAULT. Env: DATABRICKS_CONFIG_PROFILE",
    // 	}.apply(t)
    // }

    async function configureProviderAndReturnConfig(
        cf: Partial<ConfigFixture>
    ): Promise<Config> {
        const config = new Config({
            host: cf.host,
            token: cf.token,
            username: cf.username,
            password: cf.password,
            profile: cf.profile,
            configFile: cf.configFile || tmp,
            azureClientId: cf.azureClientId,
            azureClientSecret: cf.azureClientSecret,
            azureTenantId: cf.azureTenantId,
            azureResourceId: cf.azureResourceId,
            authType: cf.authType,
            env: cf.env,
        });

        await config.authenticate({});
        return config;
    }

    async function apply(cf: Partial<ConfigFixture>) {
        let config: Config;
        try {
            config = await configureProviderAndReturnConfig(cf);
        } catch (error: any) {
            console.trace(error);
            if (cf.assertError !== "") {
                assert.equal(error.message, cf.assertError);
                return;
            }
            throw error;
        }
        if (cf.assertAzure !== undefined) {
            assert.equal(cf.assertAzure, config.isAzure());
        }
        assert.equal(cf.assertAuth, config.authType);
        assert.equal(cf.assertHost, config.host);
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
    env: Record<string, string>;
    assertError: string;
    assertAuth: string;
    assertHost: string;
    assertAzure: boolean;
}
