import type { Feature } from "../../kernel/feature";
import { UNITY_GATEWAY_SAVED_PROFILE } from "../../kernel/unity-gateway/UnityGatewayService";
import { contextKey } from "../../platform/contextKeys";
import { CancelledError } from "../../platform/errors";
import { when } from "../../platform/reactive";
import {
    CHOOSE_MODEL,
    SELECT_WORKSPACE,
    SIGN_IN,
    SIGN_IN_AGAIN,
    SIGN_OUT,
    SWITCH_WORKSPACE,
    connectFailure,
    UnityGatewayCommands,
} from "./UnityGatewayCommands";
import { UnityGatewaySection } from "./UnityGatewaySection";
import { SHOW_MENU, UnityGatewayStatusBarItem } from "./UnityGatewayStatusBarItem";

/**
 * Unity Gateway is off in this window: a Databricks remote session, or
 * Cursor. Negated, so that the commands show before the extension
 * activates, and running one activates it.
 */
export const UNITY_GATEWAY_UNAVAILABLE = contextKey<boolean>(
    "databricks.context.unityGateway.unavailable",
);

/** A Unity Gateway profile is saved, connected or not. The old extension's name. */
export const UNITY_GATEWAY_HAS_SAVED_PROFILE = contextKey<boolean>(
    "databricks.context.unityGateway.hasSavedProfile",
);

/**
 * The Unity Gateway connection (`kernel.unityGateway`): its commands, its
 * status-bar item and its Models row in the Models & AI tools view, which
 * counts the models and opens Chat's model picker when clicked. Separate from the
 * window's connection, so a bundle target never changes where models come
 * from. The connection feature shows it in the Connection view.
 */
export const unityGateway: Feature = {
    id: "unity-gateway",
    contextKeys: [UNITY_GATEWAY_UNAVAILABLE, UNITY_GATEWAY_HAS_SAVED_PROFILE],
    session: Object.fromEntries(
        [
            SIGN_IN,
            SIGN_OUT,
            SHOW_MENU,
            SWITCH_WORKSPACE,
            SIGN_IN_AGAIN,
            SELECT_WORKSPACE,
            CHOOSE_MODEL,
        ].map((id) => [
            id,
            {
                unavailable:
                    "Unity Gateway signs in with a profile, and a session window has none.",
                instead: "Use Unity Gateway and its chat models from a local window.",
            },
        ]),
    ),

    register(ctx) {
        const { kernel } = ctx;
        const service = kernel.unityGateway;
        new UnityGatewayCommands(
            service,
            ctx.commands,
            kernel.connection.profiles,
            ctx.log,
        ).register();
        void kernel.contextKeys.set(UNITY_GATEWAY_UNAVAILABLE, !service.available);
        if (!service.available) {
            return;
        }
        const syncSaved = () =>
            void kernel.contextKeys.set(
                UNITY_GATEWAY_HAS_SAVED_PROFILE,
                kernel.state.get(UNITY_GATEWAY_SAVED_PROFILE) !== undefined,
            );
        ctx.subscriptions.push(
            new UnityGatewayStatusBarItem(service.state),
            ctx.sections.add(new UnityGatewaySection(service.state, service.models)),
            kernel.state.onDidChange(UNITY_GATEWAY_SAVED_PROFILE)(syncSaved),
        );
        syncSaved();
        // One sign-in to start with: the first workspace connection, signed in
        // by hand, at startup or for a target, signs Unity Gateway in with its
        // profile too. Only once per user (`service.copy()`), and again on a
        // sign-in by hand while both are signed out (the connection feature's
        // `configureLogin`); a saved one is restored instead (`service.start()`).
        ctx.whileConnected((connection) => {
            const { profile } = connection;
            if (profile === undefined) {
                return;
            }
            // Its failure doesn't fail the workspace sign-in: the Connection view's row says it isn't signed in.
            service.copy(profile)?.catch((e: unknown) => {
                if (!(e instanceof CancelledError)) {
                    ctx.log.warn(`Unity Gateway didn't sign in with profile ${profile}`, e);
                }
            });
        });
    },

    start(ctx) {
        const { connection, unityGateway: service } = ctx.kernel;
        // A failed restore says why once, as a failed workspace connection
        // does. Not when the workspace failed the same way with the same
        // profile: its notice says why, and its button reconnects both.
        void service.started?.then(async (s) => {
            if (s?.status !== "error") {
                return;
            }
            const w = await when(connection.state, (c) => c.status !== "connecting");
            if (w.status !== "error" || w.profile !== s.profile || w.remedy !== s.remedy) {
                void ctx.commands.showError(connectFailure(s, () => service.reconnect()));
            }
        });
    },
};
