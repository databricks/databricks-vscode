/**
 * Live-progress narration for the uv "Setting up Python environment" run.
 *
 * Under `--output json` the CLI streams no progress: it buffers everything and
 * prints one result object at the end (see {@link PythonSetupCliClient}). So the
 * only hard fact we have during the run is elapsed time. This module turns that
 * into an honest, informative progress line: it narrates the real, ordered work
 * `databricks environments setup-local` performs, paced by measured typical
 * timing — it never shows a percentage and never claims a phase finished,
 * because we cannot observe that without a live signal.
 *
 * When the CLI grows a structured progress stream, the observed phase feeds this
 * same rendering and the time estimate for the leading phases drops away; the
 * elapsed counter and the provision rotation stay as the fallback.
 */

/** How long each leading phase is shown before advancing, in ms. */
const LEADING_PHASE_MS = 1500;

/**
 * The fast leading phases, in the order the CLI runs them. They complete almost
 * instantly in practice, so each is shown briefly — long enough to read, not so
 * long that the line sits on a phase that already finished. The copy mirrors the
 * CLI's own spinner labels for the same phases.
 */
const LEADING_PHASES: readonly string[] = [
    "Checking prerequisites…",
    "Resolving your Databricks compute…",
    "Fetching matching versions and constraints…",
    "Updating pyproject.toml…",
];

/** How long each provision sub-step is shown before rotating, in ms. */
const PROVISION_ROTATE_MS = 6000;

/**
 * The real sub-steps uv performs during the dominant `provision` phase
 * (installing Python, then downloading and syncing dependencies), in order.
 * This is where the cold-run minutes go, so the line dwells here and rotates
 * through these until the run ends rather than guessing when provision finishes.
 */
const PROVISION_STEPS: readonly string[] = [
    "Installing the matching Python version…",
    "Downloading databricks-connect and dependencies…",
    "Resolving and syncing packages with uv…",
];

const LEADING_TOTAL_MS = LEADING_PHASES.length * LEADING_PHASE_MS;

/** Elapsed time as `m:ss` (e.g. `1:12`). Negative input clamps to `0:00`. */
export function formatElapsed(ms: number): string {
    const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * The phase/work label to show for a run that has been going for `elapsedMs`:
 * the leading phases in turn, then the rotating provision sub-steps, looping.
 */
export function setupProgressPhase(elapsedMs: number): string {
    const elapsed = Math.max(0, elapsedMs);
    if (elapsed < LEADING_TOTAL_MS) {
        return LEADING_PHASES[Math.floor(elapsed / LEADING_PHASE_MS)];
    }
    const intoProvision = elapsed - LEADING_TOTAL_MS;
    const step =
        Math.floor(intoProvision / PROVISION_ROTATE_MS) %
        PROVISION_STEPS.length;
    return PROVISION_STEPS[step];
}

/** The full progress line: the current phase plus the elapsed counter. */
export function setupProgressMessage(elapsedMs: number): string {
    return `${setupProgressPhase(elapsedMs)} (${formatElapsed(elapsedMs)})`;
}
