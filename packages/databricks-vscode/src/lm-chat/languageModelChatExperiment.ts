import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {HostUtils} from "../utils";

/**
 * `databricks.experiments.optInto` id for Unity Gateway Chat.
 * Must match the enum in package.json.
 */
export const LANGUAGE_MODEL_CHAT_EXPERIMENT_ID = "chat.unityGateway";

/**
 * Unity Gateway Chat is experimental. Cursor stubs VS Code's Language Model
 * Chat provider API (registering a provider only logs a warning), so it stays
 * off there even when opted into.
 */
export function isLanguageModelChatEnabled(): boolean {
    return (
        !HostUtils.isCursor() &&
        workspaceConfigs.experimetalFeatureOverides.includes(
            LANGUAGE_MODEL_CHAT_EXPERIMENT_ID
        )
    );
}
