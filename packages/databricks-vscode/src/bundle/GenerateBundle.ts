import {ExecUtils} from "@databricks/databricks-sdk";
// Q: How does this import work?
import {CliWrapper} from "../cli/CliWrapper";
import {extensions, Uri} from "vscode";

export async function generateBundleSchema(cli: CliWrapper, schemaUri: Uri) {
    const cmd = cli.getGenerateSchemaCommand(schemaUri.fsPath);
    await ExecUtils.execFileWithShell(cmd.command, cmd.args);

    const extensionYaml = extensions.getExtension("redhat.vscode-yaml");
    if (extensionYaml) {
        const redHatYamlSchemaApi = await extensionYaml.activate();

        // TODO: test that other file schema's are not overriden
        // TODO: Test priority here, does settings yaml.settigns override this?
        redHatYamlSchemaApi.registerContributor(
            "databricks",
            (resource: string) => {
                const validFileNames: string[] = [
                    "databricks.yml",
                    "databricks.yaml",
                    "bundle.yml",
                    "bundle.yaml",
                ];
                for (const name of validFileNames) {
                    if (resource.endsWith(name)) {
                        return schemaUri.toString();
                    }
                }
                return undefined;
            }
        );
    }
}
