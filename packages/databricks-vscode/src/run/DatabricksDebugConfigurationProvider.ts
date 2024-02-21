import {
    DebugConfigurationProvider,
    DebugConfiguration,
    WorkspaceFolder,
} from "vscode";
import {DatabricksEnvFileManager} from "../file-managers/DatabricksEnvFileManager";

export class DatabricksDebugConfigurationProvider
    implements DebugConfigurationProvider
{
    constructor(private readonly databricksEnvFile: DatabricksEnvFileManager) {}
    async resolveDebugConfigurationWithSubstitutedVariables?(
        folder: WorkspaceFolder | undefined,
        debugConfiguration: DebugConfiguration
    ) {
        if (debugConfiguration.type !== "debugpy") {
            return debugConfiguration;
        }

        debugConfiguration.env = {
            ...(await this.databricksEnvFile.getEnv()),
            ...(debugConfiguration.env ?? {}),
        };

        if (debugConfiguration.isInternalDatabricksRun) {
            debugConfiguration.console = "internalConsole";
        }

        return debugConfiguration;
    }
}
