import { MarkdownString, ThemeIcon, TreeItemCollapsibleState } from "vscode";
import type { ConnectionState } from "../../kernel/connection/ConnectionService";
import type { UnityGatewayModelsState } from "../../kernel/unity-gateway/UnityGatewayModels";
import { disposeAll, type Event } from "../../platform/event";
import type { State } from "../../platform/reactive";
import {
    MODELS_SECTION_ORDER,
    type ConfigurationItem,
    type ConfigurationSection,
} from "../../platform/ui/sections";
import { CHOOSE_MODEL, SIGN_IN } from "./UnityGatewayCommands";
import { SHOW_MENU } from "./UnityGatewayStatusBarItem";

const ROW_ID = "UNITY-GATEWAY.models";
const LEARN_MORE = "https://docs.databricks.com/aws/en/ai-gateway/";

/** What the listing adds to the row's description, icon and hover. */
function listing(models: UnityGatewayModelsState): {
    text: string;
    icon: ThemeIcon;
    detail?: string;
} {
    switch (models.status) {
        case "ready":
            return models.value.length === 0
                ? {
                      text: "None available",
                      icon: new ThemeIcon("comment-discussion"),
                      detail: "This workspace has no model on Unity Gateway's Responses route.",
                  }
                : {
                      text: `${models.value.length} available`,
                      icon: new ThemeIcon("comment-discussion"),
                  };
        case "error":
            return {
                text: "Can't list them",
                icon: new ThemeIcon("warning"),
                detail: `Can't list the Unity Gateway models\n${models.error.message}`,
            };
        default:
            return { text: "Loading…", icon: new ThemeIcon("sync~spin") };
    }
}

/**
 * The Models row, for the Unity Gateway connection and its listing: a pure
 * function, unit-tested. A click opens Chat's model picker. No other actions
 * of its own: the Connection view's Unity Gateway row has the switch and the
 * sign-out.
 */
export function modelsRow(
    state: ConnectionState,
    models: UnityGatewayModelsState,
): ConfigurationItem {
    const base = {
        label: "Models",
        id: ROW_ID,
        contextValue: `databricks.unityGateway.models.${state.status}`,
        collapsibleState: TreeItemCollapsibleState.None,
    };
    switch (state.status) {
        case "signedOut":
            return {
                ...base,
                description: "Sign in to Unity Gateway to use them",
                tooltip: new MarkdownString(
                    `Use Databricks models in VS Code Chat. [Learn more](${LEARN_MORE})`,
                ),
                iconPath: new ThemeIcon("sign-in"),
                command: { title: "Sign in to Unity Gateway", command: SIGN_IN },
            };
        case "connecting":
            return {
                ...base,
                description: state.profile ? `Connecting… · from ${state.profile}` : "Connecting…",
                iconPath: new ThemeIcon("sync~spin"),
            };
        case "connected": {
            const c = state.connection;
            const list = listing(models);
            return {
                ...base,
                description: `${list.text} · from ${c.profile ?? c.host}`,
                tooltip: [
                    `From Unity Gateway on ${c.host}${c.profile !== undefined ? ` with profile ${c.profile}` : ""}`,
                    ...(list.detail !== undefined ? [list.detail] : []),
                ].join("\n"),
                iconPath: list.icon,
                // Clickable only when there are models to choose from.
                ...(models.status === "ready" &&
                    models.value.length > 0 && {
                        command: { title: "Choose a model in Chat", command: CHOOSE_MODEL },
                    }),
            };
        }
        default:
            return {
                ...base,
                description: state.profile ? `Not connected · ${state.profile}` : "Not connected",
                tooltip: ["Unity Gateway isn't connected", state.error.message].join("\n"),
                iconPath: new ThemeIcon("warning"),
                command: { title: "Manage Unity Gateway connection", command: SHOW_MENU },
            };
    }
}

/**
 * The Models row in the Models & AI tools view, in window scope: where the
 * models come from (Unity Gateway's profile), and how many there are.
 */
export class UnityGatewaySection implements ConfigurationSection {
    readonly id = "unityGateway";
    readonly view = "modelsAndAiTools";
    readonly order = MODELS_SECTION_ORDER.unityGateway;
    readonly onDidChange: Event<void>;

    constructor(
        private readonly state: State<ConnectionState>,
        private readonly models: State<UnityGatewayModelsState>,
    ) {
        this.onDidChange = (listener) => {
            const subscriptions = [
                state.onDidChange(() => listener()),
                models.onDidChange(() => listener()),
            ];
            return { dispose: () => disposeAll(subscriptions) };
        };
    }

    getChildren(parent?: ConfigurationItem): ConfigurationItem[] {
        return parent === undefined ? [modelsRow(this.state.value, this.models.value)] : [];
    }
}
