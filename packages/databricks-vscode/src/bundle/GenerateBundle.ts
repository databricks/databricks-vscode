import {CliWrapper} from "../cli/CliWrapper";
import {extensions, Uri} from "vscode";
import path from "node:path";

export async function generateBundleSchema(cli: CliWrapper) {
    // get freshly generated bundle schema
    const bundleSchema = await cli.getBundleSchema();

    // URI scheme for DABs JSON schemas
    const dabsUriScheme = "dabs";

    // URI for bundle root config json schema
    const rootConfigSchemaUri = `${dabsUriScheme}:///root.json`;

    const extensionYaml = extensions.getExtension("redhat.vscode-yaml");
    if (extensionYaml) {
        const redHatYamlSchemaApi = await extensionYaml.activate();

        // We use the API exposed from teh activate() function of the redhat.vscode-yaml
        // extension to registor a custom schema provider
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
                // Any JSON schemas with URI scheme = "dabs" resolves here
                const parsedUri = Uri.parse(uri);
                if (parsedUri.scheme === dabsUriScheme) {
                    return bundleSchema;
                }
            }
        );
    }
}
