import {CliWrapper} from "../cli/CliWrapper";
import {ExtensionContext, extensions, Uri} from "vscode";
import {BundleFileSet} from "./BundleFileSet";
import {BundleWatcher} from "../file-managers/BundleWatcher";

export async function registerBundleAutocompleteProvider(
    cli: CliWrapper,
    bundleFileSet: BundleFileSet,
    bundleWatcher: BundleWatcher,
    context: ExtensionContext
) {
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
        let bundleFileList = await bundleFileSet.allFiles();
        context.subscriptions.push(
            bundleWatcher.onDidChange(async () => {
                bundleFileList = await bundleFileSet.allFiles();
            })
        );
        redHatYamlSchemaApi.registerContributor(
            "dabs",
            (resource: string) => {
                if (
                    bundleFileList.find(
                        (i) => i.fsPath === Uri.parse(resource).fsPath
                    ) !== undefined
                ) {
                    return rootConfigSchemaUri;
                }
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
