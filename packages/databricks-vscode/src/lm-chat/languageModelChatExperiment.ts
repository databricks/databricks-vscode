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
 * provider only logs a warning), and in remote sessions, where signing in can't
 * complete: the extension there only sees the remote's profiles and can't finish
 * the OAuth browser sign-in.
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
