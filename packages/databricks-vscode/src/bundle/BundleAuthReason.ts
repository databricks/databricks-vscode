/**
 * Why the remote-mode credential guard won't send the session's credentials to
 * a bundle target. Shared by the guard (which turns these into the "paused"
 * error) and the Target row (which shows a badge and tooltip), so the two never
 * disagree about the reason.
 */

/** The guard couldn't vouch for where the CLI would send the credentials. */
export type UnresolvedReason =
    | "profile"
    | "variable"
    | "multi-file"
    | "invalid-host"
    | "absent-target"
    | "glob-negation"
    | "unreadable";

/** Every reason a target can be paused, including a confirmed host mismatch. */
export type PausedReason = UnresolvedReason | "host-mismatch";

/**
 * A short phrase that completes "Bundle commands … are paused because …". Kept
 * phrasing-only (no host interpolation) so it reads the same in the guard error
 * and the Target row tooltip.
 */
export function describePausedReason(reason: PausedReason): string {
    switch (reason) {
        case "host-mismatch":
            return "it deploys to a different workspace than this session";
        case "profile":
            return (
                "it selects an authentication profile, which can point at " +
                "another workspace"
            );
        case "variable":
            return (
                "its workspace is set by a ${…} variable this extension can't " +
                "resolve"
            );
        case "multi-file":
            return "its host or profile is set in more than one file";
        case "invalid-host":
            return "its workspace host can't be parsed";
        case "absent-target":
            return "it isn't defined in the bundle on disk";
        case "glob-negation":
            return "an include pattern uses a [!…] class the CLI reads differently";
        case "unreadable":
            return "its bundle configuration couldn't be read";
    }
}
