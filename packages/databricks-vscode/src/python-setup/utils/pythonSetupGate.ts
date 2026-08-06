import {
    DetectionSignal,
    PackageManager,
    PackageManagerDetection,
} from "../../language/packageManagerDetection";

/**
 * Managers whose presence means the project is already committed to a
 * non-uv workflow. If any of these fired, we must not offer uv-native setup —
 * it would fight the tool the project already uses (pip/poetry/conda). The
 * legacy pip checklist covers those projects instead; the two entry points are
 * mutually exclusive and never shown together.
 */
const COMPETING_MANAGERS: PackageManager[] = ["pip", "poetry", "conda"];

/**
 * The pip signals that reflect a real pip workflow, as opposed to merely a
 * packaging-shaped `pyproject.toml`.
 *
 * `pyproject.pipOnly` is deliberately absent: it fires on any `pyproject.toml`
 * that declares `[project]`/`[build-system]` without a `[tool.uv]` or
 * `[tool.poetry]` section, which is exactly the shape `databricks bundle init`
 * generates and which uv itself works with natively. Treating it as a pip
 * workflow would hide setup from the template our own onboarding produces. A
 * `requirements.txt`, a `constraints.txt`, or a plain (non-uv) virtualenv are
 * different: they are positive evidence that someone is driving pip directly.
 */
const SUBSTANTIVE_PIP_SIGNALS: DetectionSignal[] = [
    "requirements.txt",
    "constraints.txt",
    "interpreter.venv",
];

/**
 * Whether pip was attributed only because the project has a packaging-shaped
 * `pyproject.toml`, with no other pip evidence.
 */
function pipIsPyprojectShapeOnly(
    managers: readonly PackageManager[],
    signals: readonly DetectionSignal[]
): boolean {
    return (
        managers.includes("pip") &&
        signals.includes("pyproject.pipOnly") &&
        !signals.some((s) => SUBSTANTIVE_PIP_SIGNALS.includes(s))
    );
}

/**
 * Whether to surface the uv-native python-setup entry for the current project.
 *
 * Pure predicate over the feature flag and the live detection result. Shows
 * only when both hold:
 *  - the feature flag is on (the whole feature is opt-in while the CLI command
 *    ships only in custom builds), AND
 *  - no competing manager (pip/poetry/conda) is driving the project. Even a
 *    uv-primary project is excluded if it also shows poetry/conda signals, or
 *    real pip signals, so setup never fights an environment the project already
 *    depends on.
 *
 * The one deliberate exception is a `pyproject.toml` that merely *looks* like a
 * packaging project (`[project]`/`[build-system]`, no `[tool.uv]`, no
 * `uv.lock`). The classifier attributes that to pip — a documented skew, since
 * uv needs neither of those to manage such a project — and that covers every
 * freshly-initialised bundle project until someone runs `uv lock`. Those are
 * precisely the projects this feature exists to set up, so pip attributed from
 * that signal alone is not treated as competing. See
 * {@link SUBSTANTIVE_PIP_SIGNALS}.
 */
export function shouldShowPythonSetup(args: {
    flagOn: boolean;
    detection: Pick<
        PackageManagerDetection,
        "primary" | "managers" | "signals"
    >;
}): boolean {
    if (!args.flagOn) {
        return false;
    }
    const {managers, signals} = args.detection;

    // Discount a pip attribution that rests only on the pyproject's shape, then
    // judge the project on what is left. Poetry and conda are never discounted.
    const effective = pipIsPyprojectShapeOnly(managers, signals)
        ? managers.filter((m) => m !== "pip")
        : managers;

    return !effective.some((m) => COMPETING_MANAGERS.includes(m));
}
