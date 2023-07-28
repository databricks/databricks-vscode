import {CliWrapper} from "../cli/CliWrapper";
import {extensions, Uri} from "vscode";
import {workspace, RelativePattern, GlobPattern, Disposable} from "vscode";
import YAML from "yaml";

export async function generateBundleSchema(
    cli: CliWrapper
): Promise<Disposable> {
    // get freshly generated bundle schema
    const bundleSchema = await cli.getBundleSchema();

    // URI scheme for DABs JSON schemas
    const dabsUriScheme = "dabs";

    // URI for bundle root config json schema
    const rootConfigSchemaUri = `${dabsUriScheme}:///dabs.json`;

    const folder = workspace.workspaceFolders?.[0];
    if (!folder) {
        throw new Error("No workspace folder found");
    }

    const configFilePattern = new RelativePattern(
        folder,
        "{databricks,bundle}.{yml,yaml}"
    );

    // file watcher on all YAML files
    const yamlWatcher = workspace.createFileSystemWatcher("**/*.{yml,yaml}");
    yamlWatcher.onDidCreate(async () => {
        await updateFileGlobs();
    });
    const configWatcher = workspace.createFileSystemWatcher(configFilePattern);
    configWatcher.onDidChange(async () => {
        await updateFileGlobs();
    });

    let configFiles = new Set<string>();
    await updateFileGlobs();

    async function updateFileGlobs() {
        const fileGlobs: GlobPattern[] = [configFilePattern];

        // find all YAML files that are included in the root config file
        for (const configFile of await workspace.findFiles(configFilePattern)) {
            try {
                const fileContents = await workspace.fs.readFile(configFile);
                const config = YAML.parse(fileContents.toString());
                if (config.include) {
                    fileGlobs.push(
                        ...config.include.map(
                            (g: string) => new RelativePattern(folder!, g)
                        )
                    );
                }
            } catch (e) {
                // ignore errors
            }
        }

        // expand globs to find all config files
        const newConfigFiles = new Set<string>();
        for (const glob of fileGlobs) {
            for (const file of await workspace.findFiles(glob)) {
                newConfigFiles.add(file.path);
            }
        }
        configFiles = newConfigFiles;
    }

    const extensionYaml = extensions.getExtension("redhat.vscode-yaml");
    if (extensionYaml) {
        const redHatYamlSchemaApi = await extensionYaml.activate();

        // We use the API exposed from teh activate() function of the redhat.vscode-yaml
        // extension to registor a custom schema provider
        redHatYamlSchemaApi.registerContributor(
            "dabs",
            (resource: string) => {
                const resourceUri = Uri.parse(resource);
                if (configFiles.has(resourceUri.path)) {
                    return rootConfigSchemaUri;
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

    return {
        dispose: () => {
            yamlWatcher.dispose();
            configWatcher.dispose();
        },
    };
}
