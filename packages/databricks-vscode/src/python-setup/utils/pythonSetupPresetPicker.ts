import {QuickPick, QuickPickItem} from "vscode";
import {SetupLocalInvocation} from "./setupLocalArgs";

/** The resolved compute target a setup run provisions for. */
export type SetupComputeTarget = SetupLocalInvocation["compute"];

/**
 * The Python-setup preset the user picks. Each tier nests inside the previous
 * one, so they map onto the two orthogonal `setup-local` skip flags (see
 * {@link presetToFlags}):
 *
 * - `full` — matching Python + Databricks Connect, and the runtime/dependency
 *   pins. No flags.
 * - `dbconnect` — matching Python + Databricks Connect, but no pins
 *   (`--no-constraints`).
 * - `python` — matching Python only (`--no-constraints --no-dbconnect`).
 *
 * The fourth flag combination (pins without databricks-connect, today's
 * `--constraints-only`) is intentionally not a tier: keeping the tiers strictly
 * nested is what lets a single-select picker present them as one axis.
 */
export type SetupPreset = "full" | "dbconnect" | "python";

/** The `setup-local` skip flags a preset resolves to. */
export interface SetupPresetFlags {
    skipConstraints?: boolean;
    skipDbconnect?: boolean;
}

/**
 * Map a preset to the orthogonal skip flags the CLI invocation carries. Only
 * the `true` flags are set, so a `full` run adds nothing and the argv stays
 * flag-free (matching `buildSetupLocalArgs`, which pushes a flag only when its
 * field is truthy).
 */
export function presetToFlags(preset: SetupPreset): SetupPresetFlags {
    switch (preset) {
        case "full":
            return {};
        case "dbconnect":
            return {skipConstraints: true};
        case "python":
            return {skipConstraints: true, skipDbconnect: true};
    }
}

/**
 * The human label for the resolved compute target, used in the picker title
 * (e.g. "Set up Python environment for Runtime 17.3"). Serverless carries its
 * version directly; a cluster is described by its DBR major.minor when the
 * `dbrVersion` is known and parseable, and otherwise by a generic label — the
 * cluster id is never a resolved runtime and a cluster *name* is user-chosen
 * (routinely a person's name), so neither is shown.
 */
export function computeTargetLabel(
    compute: SetupComputeTarget,
    dbrVersion?: Array<number | "x">
): string {
    if (compute.kind === "serverless") {
        return `serverless v${compute.version}`;
    }
    const [major, minor] = dbrVersion ?? [];
    if (typeof major === "number" && typeof minor === "number") {
        return `Runtime ${major}.${minor}`;
    }
    return "the attached cluster";
}

/** A preset QuickPick row; `preset` is the choice the row resolves to. */
export interface PresetPickItem extends QuickPickItem {
    preset: SetupPreset;
}

/** Documents the shared side effects every tier has (all provision a venv). */
const PLACEHOLDER =
    "Create a uv managed .venv and pyproject.toml (if one exists, it's saved to pyproject.toml.bak)";

/**
 * Build the three preset rows in nesting order (Full → DB Connect → Python).
 * Pure, so the copy is unit-testable without a VS Code host. Full is listed
 * first and starred as the recommendation; the codicons (`$(...)`) render as
 * inline icons in the QuickPick.
 */
export function buildPresetPickItems(): PresetPickItem[] {
    return [
        {
            label: "$(star-full) Full environment setup",
            description: "Recommended so code runs as it would on Databricks",
            detail: "Installs matching Python + Databricks Connect versions and pins cluster dependencies.",
            preset: "full",
        },
        {
            label: "$(tools) DB Connect setup",
            description: "Recommended to run Spark code remotely.",
            detail: "Installs matching Python + Databricks Connect versions only.",
            preset: "dbconnect",
        },
        {
            label: "$(code) Python setup",
            detail: "Installs matching Python version only.",
            preset: "python",
        },
    ];
}

/**
 * Show the single-select preset picker for a resolved compute target and return
 * the chosen preset, or `undefined` if the user dismissed it.
 *
 * Uses the explicit-lifecycle `createQuickPick` API (not the one-shot
 * `showQuickPick`) so `onDidAccept` resolves the chosen row and `onDidHide`
 * reports a dismissal, matching the ticket's UX contract. `createQuickPick` is
 * injected (the wiring passes `window.createQuickPick`) so the flow is
 * unit-testable without a VS Code host. The title carries `computeLabel` (the
 * resolved compute, e.g. "Runtime 17.3" or "serverless v5") and the placeholder
 * documents the shared side effects.
 */
export function pickSetupPreset(
    computeLabel: string,
    createQuickPick: <T extends QuickPickItem>() => QuickPick<T>
): Promise<SetupPreset | undefined> {
    const quickPick = createQuickPick<PresetPickItem>();
    quickPick.title = `Set up Python environment for ${computeLabel}`;
    quickPick.placeholder = PLACEHOLDER;
    quickPick.items = buildPresetPickItems();

    return new Promise<SetupPreset | undefined>((resolve) => {
        let picked: SetupPreset | undefined;
        quickPick.onDidAccept(() => {
            const selected = quickPick.selectedItems[0];
            if (selected === undefined) {
                return;
            }
            picked = selected.preset;
            quickPick.hide();
        });
        quickPick.onDidHide(() => {
            resolve(picked);
            quickPick.dispose();
        });
        quickPick.show();
    });
}
