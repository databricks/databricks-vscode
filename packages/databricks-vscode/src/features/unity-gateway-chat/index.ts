import { commands, lm, window } from "vscode";
import { RENEW_LOGIN } from "../../kernel/connection/commands";
import type { ConnectionState } from "../../kernel/connection/ConnectionService";
import type { Feature, FeatureContext } from "../../kernel/feature";
import { UNITY_GATEWAY_VENDOR } from "../../kernel/unity-gateway/UnityGatewayModels";
import { UnityGatewayChatProvider, type SignInFailure } from "./UnityGatewayChatProvider";
import { UNITY_GATEWAY_CHAT_EVENTS } from "./telemetry";

/**
 * Unity Gateway models in VS Code Chat, through the Unity Gateway connection
 * (`kernel.unityGateway`), in window scope. Off where that is: in a session
 * window and in Cursor. The vendor is declared in `package.json`, so VS Code
 * activates the extension whenever something lists every vendor's models.
 */
export const unityGatewayChat: Feature = {
    id: "unity-gateway-chat",
    telemetryEvents: UNITY_GATEWAY_CHAT_EVENTS,

    register(ctx) {
        const gateway = ctx.kernel.unityGateway;
        if (!gateway.available) {
            return;
        }
        const provider = new UnityGatewayChatProvider(
            ctx.telemetry,
            gateway,
            ctx.log,
            (failure) => {
                promptSignIn(ctx, signInPrompt(failure, gateway.state.value)).catch((e: unknown) =>
                    ctx.log.error("Signing in from a failed chat request failed", e),
                );
            },
        );
        ctx.subscriptions.push(
            provider,
            lm.registerLanguageModelChatProvider(UNITY_GATEWAY_VENDOR, provider),
        );
    },
};

/** The unity-gateway feature's commands the prompt runs, which render their own errors. */
const SIGN_IN = "databricks.unityGateway.signIn";
const SIGN_IN_AGAIN = "databricks.unityGateway.signInAgain";
const MENU = "databricks.unityGateway.showMenu";

type PromptAction =
    | { readonly kind: "command"; readonly command: string }
    /** Renews a profile's session that the gateway refused, then reconnects. */
    | { readonly kind: "renew"; readonly profile: string; readonly host: string };

export interface SignInPrompt {
    readonly message: string;
    readonly button: string;
    readonly action: PromptAction;
}

const MENU_ACTION: PromptAction = { kind: "command", command: MENU };
const MANAGE = "Manage Unity Gateway connection";

/**
 * What the prompt after a failed chat request offers: Unity Gateway's own
 * actions, as its menu has them. The workspace sign-in never comes up.
 */
export function signInPrompt(failure: SignInFailure, gateway: ConnectionState): SignInPrompt {
    if (gateway.status === "signedOut") {
        return {
            message: "You're not signed in to Unity Gateway.",
            button: "Sign in to Unity Gateway",
            action: { kind: "command", command: SIGN_IN },
        };
    }
    if (failure.kind === "expired") {
        const c = failure.connection;
        const message = `Your Unity Gateway sign-in, profile ${c.profile}, no longer works.`;
        // Only an OAuth session is renewed by signing in again with the same profile.
        if (c.authType === "databricks-cli" && c.profile !== undefined) {
            return {
                message,
                button: "Sign in again",
                action: { kind: "renew", profile: c.profile, host: c.host },
            };
        }
        return { message, button: MANAGE, action: MENU_ACTION };
    }
    const message = "Unity Gateway isn't connected.";
    if (gateway.status === "error" && gateway.remedy === "signInAgain") {
        return {
            message,
            button: "Sign in again",
            action: { kind: "command", command: SIGN_IN_AGAIN },
        };
    }
    return { message, button: MANAGE, action: MENU_ACTION };
}

/**
 * Shows the prompt, and runs its action from its button. VS Code replaces an
 * identical notification, so failures in a row leave one prompt.
 */
async function promptSignIn(ctx: FeatureContext, prompt: SignInPrompt): Promise<void> {
    if ((await window.showWarningMessage(prompt.message, prompt.button)) !== prompt.button) {
        return;
    }
    const { action } = prompt;
    if (action.kind === "command") {
        await commands.executeCommand(action.command);
        return;
    }
    await ctx.commands.execute(RENEW_LOGIN, {
        profile: action.profile,
        host: action.host,
        row: "unityGateway",
    });
    // A refused token on a connected connection: connect it again with the renewed session.
    await ctx.kernel.unityGateway.signIn(action.profile);
}
