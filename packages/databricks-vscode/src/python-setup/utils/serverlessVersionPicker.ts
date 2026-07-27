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
    bundleYaml: "bundle config",
    notebook: "notebook metadata",
    workspaceDefault: "workspace default",
    fallback: "default",
    /* eslint-enable @typescript-eslint/naming-convention */
};

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
 * Build the QuickPick rows for a ranked version list (pure, so the labelling
 * and pre-selection are unit-testable without a VS Code host). The first, i.e.
 * highest-scoring, candidate is pre-picked and visually starred; every row
 * carries its bare `version` for the caller to forward to the CLI, and a
 * `description` summarising where the version came from.
 */
export function buildVersionPickItems(
    ranked: ScoredVersion[]
): VersionPickItem[] {
    return ranked.map((r, i) => {
        const picked = i === 0;
        return {
            label: picked ? `$(star-full) ${r.version}` : r.version,
            description: describeSources(r.sources),
            version: r.version,
            picked,
        };
    });
}

/**
 * Show an always-visible, ranked serverless-version QuickPick with the top
 * candidate pre-selected, and return the confirmed bare version (or undefined
 * if the user dismissed it). Selection is never silent -- the user must
 * confirm, matching the "no silent auto-selection" requirement.
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
        placeHolder: `Recommended: ${items[0].version}`,
    });
    return selected?.version;
}
