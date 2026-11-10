import path from "node:path";
import type { ExtensionInfo } from "../../kernel/feature";
import type { TerminalEnvCollection } from "../../platform/terminalEnv";

/** One change to the integrated terminals' environment. */
export type TerminalEnvChange =
    | { readonly kind: "append"; readonly name: string; readonly value: string }
    | { readonly kind: "replace"; readonly name: string; readonly value: string };

/**
 * What every integrated terminal gets (INFRA-02): the bundled CLI on `PATH`,
 * and the upstream tag that tells CLI telemetry the call came from a terminal
 * of the extension. Ported from the old `extension.ts`, without the
 * Terraform variables: the extension no longer bundles Terraform, the bundled
 * CLI (1.20 and later) has no Terraform engine, and an older CLI set in
 * `databricks.cli.path` downloads Terraform itself.
 */
export function terminalEnvironment(
    extension: Pick<ExtensionInfo, "version" | "asAbsolutePath">,
    delimiter: string = path.delimiter,
): TerminalEnvChange[] {
    return [
        { kind: "append", name: "PATH", value: `${delimiter}${extension.asAbsolutePath("./bin")}` },
        { kind: "replace", name: "DATABRICKS_CLI_UPSTREAM", value: "databricks-vscode-terminal" },
        { kind: "replace", name: "DATABRICKS_CLI_UPSTREAM_VERSION", value: extension.version },
    ];
}

/** Replaces whatever the collection held: it is restored from the last session otherwise. */
export function applyTerminalEnvironment(
    collection: TerminalEnvCollection,
    changes: readonly TerminalEnvChange[],
): void {
    collection.clear();
    collection.persistent = false;
    collection.description = "Adds the bundled Databricks CLI to PATH.";
    for (const change of changes) {
        collection[change.kind](change.name, change.value);
    }
}
