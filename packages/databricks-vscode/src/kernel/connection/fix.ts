import { isCancellation, UserFacingError } from "../../platform/errors";
import type { MutableState } from "../../platform/reactive";
import type { ConnectionState } from "./ConnectionService";
import { AccountApiProfileError, NoWorkspaceProfileError } from "./accountOnly";
import { connectRemedy, type ConnectRemedy } from "./openConnection";
import { HostUnreachableError } from "./unreachable";

/** The fixes a failed connection can offer. Each feature runs its own action for one. */
type FixKind = "signInAgain" | "selectWorkspace" | "selectProfile" | "retry";

export interface Fix {
    readonly kind: FixKind;
    /** The button's title. */
    readonly title: string;
}

/** What decides a fix: the remedy the connection got, the host it failed on, and the error. */
interface FailedConnection {
    readonly remedy?: ConnectRemedy | "restartSession";
    readonly host?: string;
    readonly error: unknown;
}

const TITLES: Readonly<Record<FixKind, string>> = {
    signInAgain: "Sign in again",
    selectWorkspace: "Select a workspace",
    selectProfile: "Select a profile",
    retry: "Retry",
};

/**
 * The one fix a failed connection offers, if any. The workspace connection's
 * notice and menu and Unity Gateway's build their buttons from it, so they
 * agree. "Sign in again" and "Select a workspace" need the host they failed on.
 */
export function fixFor(failed: FailedConnection): Fix | undefined {
    const kind = fixKind(failed);
    return kind === undefined ? undefined : { kind, title: TITLES[kind] };
}

function fixKind({ remedy, host, error }: FailedConnection): FixKind | undefined {
    if (remedy === "signInAgain" && host !== undefined) {
        return "signInAgain";
    }
    if (remedy === "selectWorkspace" && host !== undefined) {
        return "selectWorkspace";
    }
    // A token profile that names no workspace: a profile that does, such as one from the sign-in wizard, may connect.
    if (error instanceof AccountApiProfileError || error instanceof NoWorkspaceProfileError) {
        return "selectProfile";
    }
    if (error instanceof HostUnreachableError) {
        return "retry";
    }
    return undefined;
}

/** A connection that failed: the state both rows show after a failure. */
export type FailedState = Extract<ConnectionState, { status: "error" }>;

/** What each fix does for one connection. Its notice's button and its menu's items both run these. */
export type FixActions = { readonly [K in FixKind]: () => Promise<void> };

/**
 * The state a connection that failed is left in. Both connections build it
 * here, so a failed Unity Gateway sign-in shows as a failed workspace one does.
 */
export function failedState({
    profile,
    host,
    error,
    remedy,
}: {
    readonly profile?: string;
    readonly host?: string;
    readonly error: unknown;
    readonly remedy?: ConnectRemedy | "restartSession";
}): FailedState {
    return {
        status: "error",
        profile,
        host,
        error: error instanceof Error ? error : new Error(String(error)),
        ...(remedy !== undefined ? { remedy } : {}),
    };
}

/**
 * Runs `login`, a browser login for a sign-in, with the row showing that it's
 * signing in. Cancelled, the row goes back to how it was; failed, it shows the
 * failure. Either way the error is rethrown for the caller to report.
 */
export async function duringSignIn<T>(
    state: MutableState<ConnectionState>,
    attempt: { readonly profile: string; readonly host?: string; readonly authType?: string },
    login: () => Promise<T>,
): Promise<T> {
    const before = state.value;
    const signingIn: ConnectionState = {
        status: "connecting",
        profile: attempt.profile,
        host: attempt.host,
        signingIn: true,
    };
    state.set(signingIn);
    try {
        return await login();
    } catch (error) {
        // Something else has taken the row meanwhile: that says how it went.
        if (state.value !== signingIn) {
            throw error;
        }
        state.set(
            isCancellation(error)
                ? before
                : failedState({
                      profile: attempt.profile,
                      host: attempt.host,
                      error,
                      remedy: connectRemedy(attempt.authType, error),
                  }),
        );
        throw error;
    }
}

/**
 * The notice for a failed connection of `profile`: the same wording and
 * button for both connections, the button running the connection's own fix.
 */
export function failureNotice(
    state: FailedState,
    profile: string,
    actions: FixActions,
): UserFacingError {
    const fix = fixFor(state);
    return new UserFacingError(
        "LOGIN_FAILED",
        `Can't login with config profile ${profile}: ${state.error.message}`,
        fix === undefined ? {} : { actions: [{ title: fix.title, run: actions[fix.kind] }] },
    );
}
