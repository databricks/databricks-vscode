/* eslint-disable @typescript-eslint/naming-convention */
import {Config, ConfigOptions, Loader} from "./Config";

const ENV_TO_CONFIG: Record<string, keyof ConfigOptions> = {
    DATABRICKS_CONFIG_FILE: "configFile",
    DATABRICKS_PROFILE: "profile",
    DATABRICKS_HOST: "host",
    DATABRICKS_ACCOUNT_ID: "accountId",
    DATABRICKS_TOKEN: "token",
    DATABRICKS_USERNAME: "username",
    DATABRICKS_PASSWORD: "password",
    DATABRICKS_GOOGLE_SERVICE_ACCOUNT: "googleServiceAccount",
    DATABRICKS_GOOGLE_CREDENTIALS: "googleCredentials",
    DATABRICKS_AZURE_RESOURCE_ID: "azureResourceId",
    DATABRICKS_AZURE_USE_MSI: "azureUseMSI",
    ARM_USE_MSI: "azureUseMSI",
    DATABRICKS_AZURE_CLIENT_SECRET: "azureClientSecret",
    DATABRICKS_AZURE_CLIENT_ID: "azureClientId",
    DATABRICKS_AZURE_TENANT_ID: "azureTenantId",
    ARM_ENVIRONMENT: "azureEnvironment",
    DATABRICKS_AZURE_LOGIN_APP_ID: "azureLoginAppId",
};

export class ConfigAttributes implements Loader {
    public name = "environment";

    async configure(cfg: Config): Promise<void> {
        for (const [env, config] of Object.entries(ENV_TO_CONFIG)) {
            if (process.env[env] !== undefined) {
                cfg.setAttribute(
                    config as keyof ConfigOptions,
                    process.env[env]!
                );
            }
        }
    }
}
