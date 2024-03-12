import {
    DebugConfigurationProvider,
    DebugConfiguration,
    WorkspaceFolder,
    ExtensionContext,
} from "vscode";
import path from "node:path";
import {DatabricksEnvFileManager} from "../file-managers/DatabricksEnvFileManager";

export interface DatabricksPythonDebugConfiguration extends DebugConfiguration {
    databricks?: boolean;
    program: string;
    env?: Record<string, any>;
    isInternalDatabricksRun?: boolean;
    console?: "integratedTerminal" | "externalTerminal" | "internalConsole";
}

function isTest(debugConfiguration: DebugConfiguration) {
    return (
        debugConfiguration.env?.RUN_TEST_IDS_PORT !== undefined ||
        debugConfiguration.request === "test" ||
        debugConfiguration.name === "Debug Unit Test"
    );
}
export class DatabricksDebugConfigurationProvider
    implements DebugConfigurationProvider
{
    constructor(
        private readonly context: ExtensionContext,
        private readonly databricksEnvFileManager: DatabricksEnvFileManager
    ) {}

    async resolveDebugConfigurationWithSubstitutedVariables(
        folder: WorkspaceFolder | undefined,
        debugConfiguration: DebugConfiguration
    ) {
        if (
            debugConfiguration.databricks !== true &&
            !isTest(debugConfiguration)
        ) {
            return debugConfiguration;
        }

        // Only add the bootstrap script if we are running explicit databricks debug
        // configs. Other sources of configs such as tests, should not have the bootstrap
        if (debugConfiguration.databricks) {
            const userProgram = debugConfiguration.program;
            debugConfiguration.program = this.context.asAbsolutePath(
                path.join("resources", "python", "dbconnect-bootstrap.py")
            );
            debugConfiguration.args = [
                userProgram,
                ...(debugConfiguration.args ?? []),
            ];
        }

        // Explicitly set our env vars even though bootstrap loads them.
        debugConfiguration.env = {
            ...(await this.databricksEnvFileManager.getEnv()),
            ...(debugConfiguration.env ?? {}),
        };

        return debugConfiguration;
    }
}
