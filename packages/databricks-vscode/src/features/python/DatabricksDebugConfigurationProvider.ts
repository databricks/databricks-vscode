import type { DebugConfiguration, DebugConfigurationProvider, WorkspaceFolder } from "vscode";

/** A `python` or `debugpy` launch configuration, with the attribute we contribute. */
export interface DatabricksPythonDebugConfiguration extends DebugConfiguration {
    /** Runs the program through `dbconnect-bootstrap.py`, with the project's Databricks variables. */
    databricks?: boolean;
    program?: string;
    args?: string[];
    env?: Record<string, string | undefined>;
    console?: "integratedTerminal" | "externalTerminal" | "internalConsole";
    /** The interpreter debugpy runs. */
    python?: string;
}

export interface DebugConfigurationDeps {
    /** `resources/python/dbconnect-bootstrap.py`. */
    readonly bootstrapPath: string;
    /** The project's Databricks variables, as the env file has them; undefined without a session or a connection. */
    variables(): Promise<Record<string, string> | undefined>;
}

/** The ms-python test runner's sessions, as the old provider recognised them. */
function isTest(configuration: DebugConfiguration): boolean {
    const env = configuration["env"] as Record<string, unknown> | undefined;
    return (
        env?.["RUN_TEST_IDS_PORT"] !== undefined ||
        configuration.request === "test" ||
        configuration.name === "Debug Unit Test"
    );
}

/**
 * Gives `python` and `debugpy` sessions the project's Databricks variables
 * (RUN-06): those with `databricks: true`, which also run through the
 * bootstrap, and ms-python's test sessions, so pytest can use Databricks
 * Connect. Other sessions are untouched. Ports the old
 * `DatabricksDebugConfigurationProvider`.
 *
 * Only the Databricks variables are added. The old "Debug current file
 * with Databricks Connect" also copied the extension host's whole
 * environment into the configuration; it no longer does. The session's own
 * `env` wins, as before.
 */
export class DatabricksDebugConfigurationProvider implements DebugConfigurationProvider {
    constructor(private readonly deps: DebugConfigurationDeps) {}

    async resolveDebugConfigurationWithSubstitutedVariables(
        _folder: WorkspaceFolder | undefined,
        configuration: DatabricksPythonDebugConfiguration,
    ): Promise<DatabricksPythonDebugConfiguration> {
        if (configuration.databricks !== true && !isTest(configuration)) {
            return configuration;
        }
        // Only explicit Databricks configurations run through the bootstrap; tests don't.
        if (configuration.databricks === true) {
            const program = configuration.program;
            configuration.program = this.deps.bootstrapPath;
            configuration.args = [
                ...(program !== undefined ? [program] : []),
                ...(configuration.args ?? []),
            ];
        }
        configuration.env = { ...(await this.deps.variables()), ...configuration.env };
        return configuration;
    }
}
