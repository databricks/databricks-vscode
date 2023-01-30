import {CliWrapper} from "../cli/CliWrapper";
import {extensions, Uri} from "vscode";
import * as child_process from "node:child_process";
import {promisify} from "node:util";
import path from "node:path";

export async function generateBundleSchema(cli: CliWrapper) {
    const cmd = cli.getGenerateSchemaCommand();
    const execFile = promisify(child_process.execFile);
    const {stdout, stderr} = await execFile(cmd.command, cmd.args);

    // dabs URI scheme encapsulates json schemas for DABs configs
    const dabsUriScheme = "dabs";

    // URI for the JSON schema for the root of bundle config
    const rootConfigSchemaUri = `${dabsUriScheme}:///root.json`;

    const extensionYaml = extensions.getExtension("redhat.vscode-yaml");
    if (extensionYaml) {
        const redHatYamlSchemaApi = await extensionYaml.activate();

        // We use the API exposed from teh activate() function of the redhat.vscode-yaml
        // extension to registor a custom schema provider for the dabs scheme
        redHatYamlSchemaApi.registerContributor(
            "dabs",
            (resource: string) => {
                const validFileNames: string[] = [
                    "databricks.yml",
                    "databricks.yaml",
                    "bundle.yml",
                    "bundle.yaml",
                ];
                for (const name of validFileNames) {
                    if (path.basename(resource) === name) {
                        return rootConfigSchemaUri;
                    }
                }
                return undefined;
            },
            (uri: string) => {
                // Any JSON schemas with URI scheme = "dabs" resolve here
                const parsedUri = Uri.parse(uri);
                if (parsedUri.scheme === dabsUriScheme) {
                    return stdout;
                }
            }
        );
    }
}
