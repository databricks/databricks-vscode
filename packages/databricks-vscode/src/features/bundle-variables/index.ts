import path from "node:path";
import { TreeItemCollapsibleState, workspace } from "vscode";
import type { Feature } from "../../kernel/feature";
import { OPEN_VARIABLES_FILE } from "../../kernel/project/commands";
import { NodeGroupSection } from "../../platform/ui/nodeGroup";
import { SECTION_ORDER } from "../../platform/ui/sections";
import { NodeTreeDataProvider } from "../../platform/ui/tree";
import { VariableNode } from "./nodes";
import { openVariablesFile, RESET_VARIABLES, resetVariables } from "./VariableCommands";

/**
 * The bundle's variables as the Variables group of the Project
 * view: each variable's value for the target, from `bundle validate`, or
 * from the target's `vscode.bundlevars.json` when the user overrides it
 * there; and the commands that open and reset that file. The file is owned
 * by `ProjectService`, and bundle CLI calls receive it as `BUNDLE_VAR_*`.
 * Project scope; the group shows once a target is set.
 */
export const bundleVariables: Feature = {
    id: "bundle-variables",
    // The commands need a target, as locally; the view shows once one is set.
    session: { [OPEN_VARIABLES_FILE]: "same", [RESET_VARIABLES]: "same" },

    register(ctx) {
        const { bundle, project } = ctx.kernel;
        const provider = new NodeTreeDataProvider<VariableNode>(() => {
            const declared = bundle.validated.latest?.config.variables ?? {};
            const definitions = project.active.value?.config.variables ?? {};
            const overrides = project.variables.value ?? {};
            // The YAML's variables show before validate runs; overrides of names
            // the bundle doesn't declare show too, marked as not in the bundle.
            const names = Object.keys({ ...definitions, ...declared, ...overrides });
            return names.map(
                (name) =>
                    new VariableNode(name, declared[name], definitions[name], overrides[name]),
            );
        }, ctx.log);

        ctx.whileProjectSession((session) => {
            if (session.target === undefined) {
                return;
            }
            return ctx.sections.add(
                new NodeGroupSection({
                    id: "bundleVariables",
                    order: SECTION_ORDER.variables,
                    label: "Variables",
                    groupId: "variables",
                    collapsibleState: TreeItemCollapsibleState.Collapsed,
                    nodes: () => provider.getChildren(),
                    onDidChange: (listener) => provider.onDidChangeTreeData(() => listener()),
                    log: ctx.log,
                }),
            );
        });

        ctx.commands.register(OPEN_VARIABLES_FILE, () => openVariablesFile(project), {
            scope: "project",
        });
        ctx.commands.register(RESET_VARIABLES, () => resetVariables(project), { scope: "project" });

        ctx.subscriptions.push(
            provider,
            bundle.validated.onDidChange((s) => {
                if (s.status !== "loading") {
                    provider.refresh();
                }
            }),
            // The overrides show before validate has run with them.
            project.variables.onDidChange(() => provider.refresh()),
            // The YAML's names show while validate isn't running, as when signed out.
            project.active.onDidChange(() => provider.refresh()),
            // Saving the file in an editor reloads it directly: the watcher
            // can miss a folder created mid-session on Linux.
            workspace.onDidSaveTextDocument((document) => {
                const files = project.targetFiles;
                const target = project.target.value;
                if (
                    files !== undefined &&
                    target !== undefined &&
                    samePath(document.uri.fsPath, files.variablesFile(target))
                ) {
                    project
                        .reloadTargetFiles()
                        .catch((e: unknown) =>
                            ctx.log.warn("Can't reload the bundle variables", e),
                        );
                }
            }),
        );
    },
};

function samePath(a: string, b: string): boolean {
    const [x, y] = [path.normalize(a), path.normalize(b)];
    return process.platform === "win32" ? x.toLowerCase() === y.toLowerCase() : x === y;
}
