import { internalCommand } from "../../platform/commands";

/**
 * Connection commands the kernel and other features refer to. The
 * connection feature registers them.
 */

/** The sign-in wizard; also the remedy in the kernel's "Sign in" errors. */
export const CONFIGURE_LOGIN = "databricks.connection.configureLogin";

/**
 * The sign-in wizard as a typed internal command, for features that sign in
 * before they carry on (the SSH tunnel, SSH-02). Resolves when the wizard
 * closes; the window's connection then shows whether it succeeded.
 */
export const SIGN_IN = internalCommand<undefined, void>(CONFIGURE_LOGIN);

/** Which connection a sign-in is for: its row shows the sign-in while the browser login runs. */
export type SignInRow = "workspace" | "unityGateway";

/**
 * Renews a profile's expired OAuth session (`databricks auth login`), so
 * another connection, such as Unity Gateway's, can reconnect with it. The
 * window's connection reconnects only if it failed on the same profile. `row`
 * is the connection that asks: its row shows the sign-in.
 */
export const RENEW_LOGIN = internalCommand<
    { readonly profile: string; readonly host: string; readonly row: SignInRow },
    void
>("databricks.connection.renewLogin");

/**
 * "Select a workspace" for Unity Gateway's profile, signed in to the account
 * only: the choice, saved through the CLI, then Unity Gateway signs in with
 * the profile it leaves.
 */
export const SELECT_UNITY_GATEWAY_WORKSPACE = internalCommand<
    { readonly profile: string; readonly host: string },
    void
>("databricks.connection.selectUnityGatewayWorkspace");

/** A profile chosen, or created, in the sign-in wizard. */
export interface ChosenProfile {
    readonly profile: string;
    readonly host: string;
    readonly authType?: string;
}

/**
 * What the sign-in wizard focuses first: a caller's own host and profile, when
 * it has them. Without them, the window's connection's host and no profile.
 * `row` is the connection the sign-in is for, if any: its row shows the
 * sign-in while the browser login runs, and the wizard is titled for it.
 */
export interface ProfileFocus {
    readonly host?: string;
    readonly profile?: string;
    readonly row?: SignInRow;
}

/**
 * The sign-in wizard's host and profile steps, always both, without
 * connecting the window (the new-project wizard, BNDL-01). A new profile is
 * created through the CLI, as in sign-in; an expired OAuth session is
 * renewed first.
 */
export const CHOOSE_PROFILE = internalCommand<ProfileFocus | undefined, ChosenProfile>(
    "databricks.connection.chooseProfile",
);

/** `CONNECTED_PROFILE`'s answer: `profile` is absent when the window has none to use. */
export interface ConnectedProfile {
    readonly profile?: ChosenProfile;
}

/**
 * The profile the window is connected to, for a feature that acts with it
 * (the new-project wizard, BNDL-01). An expired OAuth session is signed in
 * again first, with the same profile; the window's connection doesn't change.
 * No `profile` when the window is signed out, failed or still connecting,
 * when its workspace comes from a bundle target (a profile signed in to the
 * account only names no workspace), or when it changed during the sign-in.
 * Resolves undefined when that sign-in was dismissed or failed.
 */
export const CONNECTED_PROFILE = internalCommand<undefined, ConnectedProfile>(
    "databricks.connection.connectedProfile",
);
