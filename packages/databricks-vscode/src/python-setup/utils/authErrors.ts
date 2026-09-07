/**
 * Recognizing the one setup-local failure that is an expected, self-service
 * condition rather than a defect: the active profile's session can no longer be
 * refreshed, so the CLI aborts before producing a result and the user must
 * simply log in again.
 */

/**
 * Whether a setup-local failure message is the CLI's "your session expired,
 * re-authenticate" abort — as opposed to a genuine spawn/parse/CLI defect or a
 * transient network problem.
 *
 * Used as a *positive gate*: a match routes to a re-login prompt, and anything
 * else (including a drifted wording this misses) falls through to the normal
 * report path — so a false negative is never worse than the pre-existing
 * behavior, while a false positive would mislabel a real defect and suppress
 * its report. It is therefore tuned for precision: it requires the CLI's own
 * `databricks auth login` remediation *and* a matching cause, so an unrelated
 * failure that merely mentions a login URL cannot trip it. Whitespace is
 * collapsed first so a cause split across lines still matches, and the
 * hyphenated spelling is accepted. The message reaches us as the rejected
 * error's `.message` (a parse error with the CLI's stderr appended by the
 * setup-local gateway).
 */
export function isReauthRequiredError(message: string): boolean {
    if (typeof message !== "string" || message.length === 0) {
        return false;
    }
    const text = message.toLowerCase().replace(/\s+/g, " ");
    const mentionsLoginRemediation = text.includes("databricks auth login");
    const mentionsReauthCause =
        text.includes("reauthenticate") ||
        text.includes("re-authenticate") ||
        text.includes("refresh token is invalid") ||
        text.includes("access token could not be retrieved");
    return mentionsLoginRemediation && mentionsReauthCause;
}
