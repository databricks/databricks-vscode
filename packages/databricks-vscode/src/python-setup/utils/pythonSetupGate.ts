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
 *
 * `pip` here means a *real* pip workflow: an attribution rooted only in the
 * pyproject's shape is discounted first — see {@link SUBSTANTIVE_PIP_SIGNALS}.
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

/** The detection fields every uv-suitability decision reads. */
export type SuitabilityDetection = Pick<
    PackageManagerDetection,
    "managers" | "signals"
>;

/**
 * Whether uv-native setup fits this project at all — i.e. no competing manager
 * is driving it.
 *
 * The single source of truth for "is this one of our projects", shared by the
 * visibility gate and by the attempt telemetry's greenfield signal so the two
 * cannot drift. Judging a project by its `managers` alone is not enough: a real
 * pip workflow and a merely packaging-shaped `pyproject.toml` both read as
 * `"pip"`, which is why this takes `signals` too.
 *
 * The one deliberate exception is a `pyproject.toml` that merely *looks* like a
 * packaging project (`[project]`/`[build-system]`, no `[tool.uv]`, no
 * `uv.lock`). The classifier attributes that to pip — a documented skew, since
 * uv needs neither of those to manage such a project — and that covers every
 * freshly-initialised bundle project until someone runs `uv lock`, as well as
 * any other PEP 621 project whose build backend is not uv or poetry (pdm,
 * hatch, flit). Those are precisely the projects this feature exists to set up,
 * so pip attributed from that signal alone is not treated as competing. Poetry
 * and conda are never discounted.
 */
export function isUvSetupSuitable(detection: SuitabilityDetection): boolean {
    const {managers, signals} = detection;

    // Discount a pip attribution that rests only on the pyproject's shape, then
    // judge the project on what is left.
    const effective = pipIsPyprojectShapeOnly(managers, signals)
        ? managers.filter((m) => m !== "pip")
        : managers;

    return !effective.some((m) => COMPETING_MANAGERS.includes(m));
}
