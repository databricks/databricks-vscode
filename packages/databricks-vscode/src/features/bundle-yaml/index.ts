import path from "node:path";
import { Uri, workspace, type TextDocument } from "vscode";
import { bundleSchema, cliVersion } from "../../kernel/cli";
import { YAML } from "../../kernel/extensionDependencies";
import type { Feature } from "../../kernel/feature";
import { loadBundleSchema, registerSchemaContributor, type YamlExtensionApi } from "./BundleSchema";

/**
 * Validation, completion and hover for bundle YAML files (BNDL-04), through
 * `redhat.vscode-yaml`. Nothing runs until a file of the active project's
 * bundle opens; the schema is then loaded once for the window. Without the
 * YAML extension (a member of the extension pack, which the user may disable
 * or uninstall) bundle files get no schema, quietly, until it's installed.
 */
export const bundleYaml: Feature = {
    id: "bundle-yaml",

    register(ctx) {
        const { kernel } = ctx;
        const dependencies = kernel.extensionDependencies;
        let loading: Promise<void> | undefined;
        const bundleFiles = () => kernel.project.active.value?.files ?? [];
        const isBundleFile = (doc: TextDocument) =>
            doc.uri.scheme === "file" &&
            bundleFiles().some((f) => path.normalize(f) === path.normalize(doc.uri.fsPath));

        const load = async () => {
            if (!dependencies.available(YAML)) {
                ctx.log.info(`${YAML.id} isn't installed: bundle files get no schema`);
                return;
            }
            // `bundle schema` ran with the host env in 2.22.0, without http.proxy.
            const env = kernel.childEnv({ connection: null, cli: true, environment: "inherited" });
            const schema = await loadBundleSchema({
                cliVersion: async () => (await cliVersion(kernel.cli, { env }))?.version,
                generate: () => bundleSchema(kernel.cli, { env }),
                cacheDir: kernel.extension.globalStoragePath,
                log: ctx.log,
            });
            const api = await dependencies.activate<YamlExtensionApi>(YAML);
            if (api === undefined) {
                return;
            }
            registerSchemaContributor(api, bundleFiles, schema, (uri) => {
                const parsed = Uri.parse(uri);
                return parsed.scheme === "file" ? parsed.fsPath : undefined;
            });
        };
        const ensure = (doc: TextDocument) => {
            if (loading === undefined && isBundleFile(doc)) {
                loading = load().catch((e: unknown) =>
                    ctx.log.error("Failed to load bundle schema", e),
                );
            }
        };

        // YAML installed or enabled later, also between sessions: load the schema again.
        ctx.subscriptions.push(
            dependencies.onDidChange(YAML, () => {
                if (dependencies.available(YAML)) {
                    loading = undefined;
                    workspace.textDocuments.forEach(ensure);
                }
            }),
        );
        ctx.whileProjectSession(() => {
            workspace.textDocuments.forEach(ensure);
            return workspace.onDidOpenTextDocument(ensure);
        });
    },
};
