import {
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
 * Whether to surface the uv-native python-setup entry for the current project.
 *
 * Pure predicate over the feature flag and the live detection result. Shows
 * only when all hold:
 *  - the feature flag is on (the whole feature is opt-in while the CLI command
 *    ships only in custom builds), AND
 *  - the primary manager is `uv` or `unknown` (a clean uv project, or a
 *    greenfield project with no manager yet — the two cases uv-native setup
 *    fits), AND
 *  - no competing manager (pip/poetry/conda) fired at all. Even a uv-primary
 *    project is excluded if it also shows pip/conda/poetry signals, so setup
 *    never fights an environment the project already depends on.
 */
export function shouldShowPythonSetup(args: {
    flagOn: boolean;
    detection: Pick<PackageManagerDetection, "primary" | "managers">;
}): boolean {
    if (!args.flagOn) {
        return false;
    }
    const {primary, managers} = args.detection;
    if (primary !== "uv" && primary !== "unknown") {
        return false;
    }
    return !managers.some((m) => COMPETING_MANAGERS.includes(m));
}
