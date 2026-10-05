import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {HostUtils} from "../utils";

/**
 * `databricks.experiments.optInto` id for Unity Gateway Chat.
 * Must match the enum in package.json.
 */
export const LANGUAGE_MODEL_CHAT_EXPERIMENT_ID = "chat.unityGateway";

/**
 * Unity Gateway Chat is experimental. Even when opted into, it stays off in
 * Cursor, which stubs VS Code's Language Model Chat provider API (registering a
 * provider only logs a warning), and in Databricks remote sessions, where
 * signing in can't complete yet: the remote's config only has the session's
 * profile, and the OAuth browser sign-in doesn't finish there.
 */
export function isLanguageModelChatEnabled(): boolean {
    return (
        !HostUtils.isCursor() &&
        !HostUtils.isRemoteSshMode() &&
        workspaceConfigs.experimetalFeatureOverides.includes(
            LANGUAGE_MODEL_CHAT_EXPERIMENT_ID
        )
    );
}
