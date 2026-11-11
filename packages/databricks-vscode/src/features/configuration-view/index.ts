import { TreeItemCheckboxState, window } from "vscode";
import type { Feature } from "../../kernel/feature";
import { contextKey, type ContextKey } from "../../platform/contextKeys";
import type { SidebarView } from "../../platform/ui/sections";
import {
    CONFIGURATION_VIEW,
    ConfigurationTreeDataProvider,
    MODELS_VIEW,
    SIGN_IN_VIEW,
} from "./ConfigurationTreeDataProvider";
import { COPY_COMMAND_IDS, copyRow } from "./copyActions";
import { OpenGroups } from "./OpenGroups";

/**
 * Whether the Connection and Project views have rows. VS Code shows a view's
 * welcome content until its first rows arrive, so welcome content that can
 * show beside rows checks these, or it shows for a moment before them.
 */
export const SIGN_IN_HAS_ROWS = contextKey<boolean>("databricks.context.signInView.hasRows");
export const CONFIGURATION_HAS_ROWS = contextKey<boolean>(
    "databricks.context.configurationView.hasRows",
);

const VIEWS: readonly { name: SidebarView; id: string; hasRows?: ContextKey<boolean> }[] = [
    { name: "signIn", id: SIGN_IN_VIEW, hasRows: SIGN_IN_HAS_ROWS },
    { name: "configuration", id: CONFIGURATION_VIEW, hasRows: CONFIGURATION_HAS_ROWS },
    // It has no welcome content.
    { name: "modelsAndAiTools", id: MODELS_VIEW },
];

/**
 * The Connection, Project and Models & AI tools views. They own no rows:
 * other features contribute sections through `ctx.sections`. Connection has
 * rows only while signed in; signed out, its welcome content shows instead.
 * The feature owns the rows' copy actions. Window scope.
 */
export const configurationView: Feature = {
    id: "configuration-view",
    contextKeys: [SIGN_IN_HAS_ROWS, CONFIGURATION_HAS_ROWS],
    session: {
        [SIGN_IN_VIEW]: "same",
        [CONFIGURATION_VIEW]: {
            adapted:
                "Its Target row says when the target guard pauses the target's bundle commands, and its Python row is the session's.",
        },
        [MODELS_VIEW]: {
            unavailable:
                "Its rows, the Unity Gateway sign-in and the AI tools, aren't available in a session window.",
            instead: "Use them from a local window.",
        },
        ...Object.fromEntries(COPY_COMMAND_IDS.map((id) => [id, "same"])),
    },

    register(ctx) {
        const groups = new OpenGroups(ctx.kernel.state);
        for (const { name, id, hasRows } of VIEWS) {
            const provider = new ConfigurationTreeDataProvider(ctx.sections, ctx.log, name, groups);
            // A tree view, not just a provider: rows with checkboxes need its events.
            const view = window.createTreeView(id, { treeDataProvider: provider });
            const syncMessage = () => {
                view.message = provider.message();
            };
            const remember = (open: boolean) => (e: { element: { groupId?: string } }) => {
                if (e.element.groupId !== undefined) {
                    groups
                        .remember(e.element.groupId, open)
                        .catch((err: unknown) =>
                            ctx.log.error("Failed to remember a group's open state", err),
                        );
                }
            };
            ctx.subscriptions.push(
                view,
                view.onDidChangeCheckboxState((e) => {
                    for (const [item, state] of e.items) {
                        provider.setChecked(item, state === TreeItemCheckboxState.Checked);
                    }
                }),
                view.onDidExpandElement(remember(true)),
                view.onDidCollapseElement(remember(false)),
                ctx.sections.onDidChange(syncMessage),
                // Before VS Code 1.146, a view that starts collapsed shows no rows for 2 s when
                // first expanded (microsoft/vscode#345405). Setting its message, even to the same
                // value, makes VS Code lay its rows out.
                view.onDidChangeVisibility((e) => {
                    if (e.visible) {
                        syncMessage();
                    }
                }),
                provider,
            );
            syncMessage();
            if (hasRows !== undefined) {
                // A section may list its rows asynchronously: only the latest answer counts.
                let latest = 0;
                const syncHasRows = () => {
                    const call = ++latest;
                    void provider.getChildren().then((rows) => {
                        if (call === latest) {
                            void ctx.kernel.contextKeys.set(hasRows, rows.length > 0);
                        }
                    });
                };
                ctx.subscriptions.push(ctx.sections.onDidChange(syncHasRows));
                syncHasRows();
            }
        }
        for (const id of COPY_COMMAND_IDS) {
            ctx.commands.register(id, copyRow);
        }
    },
};
