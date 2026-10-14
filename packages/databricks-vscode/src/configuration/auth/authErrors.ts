/**
 * Recognizing the one CLI failure that is an expected, self-service condition
 * rather than a defect: the profile's session can no longer be refreshed, so
 * the CLI aborts and the user must simply log in again. Python setup and the
 * Unity Gateway sign-in prompt both rely on it.
 */

/**
 * Whether a failure message is the CLI's "your session expired,
 * re-authenticate" abort — as opposed to a genuine spawn/parse/CLI defect or a
 * transient network problem.
 *
 * Used as a *positive gate*: a match routes to a re-login prompt, and anything
 * else (including a drifted wording this misses) falls through to the normal
 * error path — so a false negative is never worse than having no check,
 * while a false positive would mislabel a real defect. It is therefore tuned
 * for precision: it requires the CLI's own `databricks auth login`
 * remediation *and* a matching cause, so an unrelated failure that merely
 * mentions a login URL cannot trip it. Whitespace is
 * collapsed first so a cause split across lines still matches, and the
 * hyphenated spelling is accepted. The message is the rejected error's
 * `.message`, which carries the CLI's stderr.
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
