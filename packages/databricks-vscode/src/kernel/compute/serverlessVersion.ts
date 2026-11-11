/**
 * Serverless environment versions are the CLI's bare-integer form (e.g.
 * "5"), the value `--serverless-version` accepts, not the `vN` form the CLI
 * echoes. Ported from the old `serverlessVersionScoring.ts`; the scoring
 * itself is in `features/compute/serverless/`.
 */

/**
 * The range the version picker offers, inclusive. The CLI accepts any bare
 * integer; this bound is the extension's own policy, raised when a new
 * environment version is offered.
 */
export const MIN_SUPPORTED_VERSION = 1;
export const MAX_SUPPORTED_VERSION = 6;

/**
 * A version is valid only if it is a bare integer in canonical form (no `vN`
 * prefix, no `+` sign, no decimals, no leading zeros, no surrounding
 * whitespace) within the supported range. This is the trust boundary:
 * values from the overrides file, bundle YAML or notebook metadata are
 * untrusted strings, and anything the `--serverless-version` flag would
 * reject must never reach the picker or the CLI.
 *
 * The `String(n) === version` check rejects non-canonical spellings like "05"
 * that would otherwise parse into the range but not match the bare string the
 * CLI expects (and would fail to merge with the canonical "5" candidate).
 */
export function isSupportedVersion(version: string): boolean {
    if (!/^\d+$/.test(version)) {
        return false;
    }
    const n = parseInt(version, 10);
    return String(n) === version && n >= MIN_SUPPORTED_VERSION && n <= MAX_SUPPORTED_VERSION;
}
