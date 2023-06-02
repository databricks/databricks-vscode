/* eslint-disable @typescript-eslint/naming-convention */
import {Config} from "./Config";
import {Client} from "./oauth/Client";

interface AzureEnvironment {
    name: string;
    serviceManagementEndpoint: string;
    resourceManagerEndpoint: string;
    activeDirectoryEndpoint: string;
}

// based on github.com/Azure/go-autorest/autorest/azure/azureEnvironments.go
export const azureEnvironments: Record<string, AzureEnvironment> = {
    PUBLIC: {
        name: "AzurePublicCloud",
        serviceManagementEndpoint: "https://management.core.windows.net/",
        resourceManagerEndpoint: "https://management.azure.com/",
        activeDirectoryEndpoint: "https://login.microsoftonline.com/",
    },

    USGOVERNMENT: {
        name: "AzureUSGovernmentCloud",
        serviceManagementEndpoint: "https://management.core.usgovcloudapi.net/",
        resourceManagerEndpoint: "https://management.usgovcloudapi.net/",
        activeDirectoryEndpoint: "https://login.microsoftonline.us/",
    },

    CHINA: {
        name: "AzureChinaCloud",
        serviceManagementEndpoint: "https://management.core.chinacloudapi.cn/",
        resourceManagerEndpoint: "https://management.chinacloudapi.cn/",
        activeDirectoryEndpoint: "https://login.chinacloudapi.cn/",
    },

    GERMAN: {
        name: "AzureGermanCloud",
        serviceManagementEndpoint: "https://management.core.cloudapi.de/",
        resourceManagerEndpoint: "https://management.microsoftazure.de/",
        activeDirectoryEndpoint: "https://login.microsoftonline.de/",
    },
};

export function getAzureEnvironment(config: Config): AzureEnvironment {
    if (!config.azureEnvironment) {
        config.azureEnvironment = "PUBLIC";
    }
    const env = azureEnvironments[config.azureEnvironment.toUpperCase()];
    if (!env) {
        throw new Error(
            `azure environment not found: ${config.azureEnvironment}`
        );
    }
    return env;
}

export async function azureEnsureWorkspaceUrl(
    config: Config,
    client: Client
): Promise<void> {
    if (!config.azureResourceId && config.host) {
        return;
    }

    const env = getAzureEnvironment(config);

    const token = await client.grant({
        resource: env.resourceManagerEndpoint,
    });

    const url = `${env.resourceManagerEndpoint.replace(/\/$/g, "")}${
        config.azureResourceId
    }?api-version=2018-04-01`;

    try {
        const response = await client.requestResource(new URL(url), token, {
            method: "GET",
        });
        const body = (await response.json()) as any;

        if (body.properties?.workspaceUrl) {
            config.host = `https://${body.properties.workspaceUrl}`;
            config.logger.debug(`Discovered workspace url: ${config.host}`);
        }
    } catch (error: any) {
        throw new Error(`cannot resolve workspace: ${error.message}`);
    }
}

// Resource ID of the Azure application we need to log in.
export const azureDatabricksLoginAppId = "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d";

export function getAzureLoginAppId(config: Config): string {
    if (config.azureLoginAppId) {
        return config.azureLoginAppId;
    }

    return azureDatabricksLoginAppId;
}
