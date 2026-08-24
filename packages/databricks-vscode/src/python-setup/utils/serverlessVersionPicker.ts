import {window} from "vscode";
import {ScoredVersion, VersionSource} from "./serverlessVersionScoring";

/** A pick item derived from a scored version; `version` is the bare value. */
export interface VersionPickItem {
    label: string;
    description: string;
    version: string;
    picked: boolean;
}

/** Human-readable provenance labels (the enum keys are internal jargon). */
const SOURCE_LABELS: Record<VersionSource, string> = {
    /* eslint-disable @typescript-eslint/naming-convention */
    pyproject: "pyproject.toml",
    bundleYaml: "bundle config",
    notebook: "notebook metadata",
    workspaceDefault: "workspace default",
    fallback: "default",
    /* eslint-enable @typescript-eslint/naming-convention */
};

/**
 * Render a bare version for display in the `vN` form the CLI, compute picker and
 * docs all use (e.g. "5" -> "v5"). Display-only: the item's `version` field
 * stays the bare integer the `--serverless-version` flag expects.
 */
function displayVersion(version: string): string {
    return `v${version}`;
}

function describeSources(sources: VersionSource[]): string {
    const labels = sources.map((s) => SOURCE_LABELS[s]);
    if (labels.length === 0) {
        return "";
    }
    if (labels.length === 1) {
        return `from ${labels[0]}`;
    }
    return `from ${labels.length} sources: ${labels.join(", ")}`;
}

/**
 * Build the QuickPick rows for a ranked version list (pure, so the labelling is
 * unit-testable without a VS Code host). The first, i.e. highest-scoring,
 * candidate is marked as the recommendation: it is listed first and visually
 * starred. (`picked` is also set for completeness, but note `showQuickPick`
 * only honours it in multi-select mode -- see {@link pickServerlessVersion} --
 * so in this single-select picker the star and ordering are what actually
 * signal the recommendation.) Each row's `label` is the `vN` display form (see
 * {@link displayVersion}), while its `version` field stays the bare integer for
 * the caller to forward to the CLI, plus a `description` summarising where the
 * version came from.
 */
export function buildVersionPickItems(
    ranked: ScoredVersion[]
): VersionPickItem[] {
    return ranked.map((r, i) => {
        const picked = i === 0;
        const label = displayVersion(r.version);
        return {
            label: picked ? `$(star-full) ${label}` : label,
            description: describeSources(r.sources),
            version: r.version,
            picked,
        };
    });
}

/**
 * Show an always-visible, ranked serverless-version QuickPick with the top
 * candidate presented as the recommendation (starred, listed first, and named
 * in the placeholder), and return the confirmed bare version (or undefined if
 * the user dismissed it). Selection is never silent -- the user must actively
 * confirm a row, matching the "no silent auto-selection" requirement.
 */
export async function pickServerlessVersion(
    ranked: ScoredVersion[]
): Promise<string | undefined> {
    const items = buildVersionPickItems(ranked);
    if (items.length === 0) {
        return undefined;
    }
    const selected = await window.showQuickPick(items, {
        title: "Select serverless environment version",
        placeHolder: `Recommended: ${displayVersion(items[0].version)}`,
    });
    return selected?.version;
}
