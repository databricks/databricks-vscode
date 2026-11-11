import assert from "node:assert";
import { CustomTreeSection, ViewControl, ViewSection } from "wdio-vscode-service";
import { waitUntilSeen } from "./wait.ts";

// Every Databricks view: `getViewSection` collapses all but the one asked
// for. A view missing here stays open and squeezes it, so its rows and
// inline actions fall out of sight.
const ViewSectionTypes = [
    "CONNECTION",
    "CLUSTERS",
    "COMPUTE",
    "PROJECT",
    "SSH TUNNEL",
    "WORKSPACE FILE SYSTEM",
    "UNITY CATALOG",
    "MODELS & AI TOOLS",
] as const;
export type ViewSectionType = (typeof ViewSectionTypes)[number];

/** The Databricks views that show, top to bottom, with the container opened. */
async function shownSections(): Promise<ViewSection[]> {
    const workbench = await browser.getWorkbench();

    let control: ViewControl | undefined;
    await browser.waitUntil(
        async () => {
            control = await workbench.getActivityBar().getViewControl("Databricks");
            if (!control) {
                return false;
            }
            return true;
        },
        {
            timeout: 10 * 1000,
            interval: 1 * 1000,
            timeoutMsg: `Can't find view control "Databricks"`,
        },
    );
    return (await (await control?.openView())?.getContent()?.getSections()) ?? [];
}

async function sectionTitle(v: ViewSection): Promise<string> {
    let title = await v.getTitle();
    if (!title) {
        // Newer VS Code versions leave the title attribute missing or empty;
        // fall back to reading the element's text content.
        title = await (v as any).title$.getText();
    }
    return title;
}

/** The titles of the Databricks views that show, top to bottom. */
export async function viewTitles(): Promise<string[]> {
    const titles: string[] = [];
    for (const v of await shownSections()) {
        titles.push(await sectionTitle(v));
    }
    return titles;
}

export async function getViewSection(name: ViewSectionType): Promise<ViewSection | undefined> {
    // One listing of the sections serves the one asked for and the ones to
    // collapse: each listing opens the container and reads every title.
    let section: ViewSection | undefined;
    let titles: string[] = [];
    let failure: string | undefined;
    await waitUntilSeen(
        async () => {
            const sections = await shownSections();
            titles = [];
            for (const v of sections) {
                titles.push(await sectionTitle(v));
            }
            const upper = titles.map((t) => t.toUpperCase());
            const index = upper.findIndex((t) => t.includes(name));
            if (index < 0) {
                return false;
            }
            try {
                // Bottom to top: collapsing a section moves only the headers below it.
                for (let i = sections.length - 1; i >= 0; i--) {
                    if (i !== index && ViewSectionTypes.some((s) => upper[i]!.includes(s))) {
                        await sections[i]!.collapse();
                    }
                }
                await sections[index]!.expand();
            } catch (e) {
                // A view that showed or hid meanwhile moved the headers: list them again.
                failure = e instanceof Error ? e.message : String(e);
                return false;
            }
            section = sections[index];
            return true;
        },
        {
            timeout: 10 * 1000,
            timeoutMsg: `Can't find view section "${name}"`,
        },
        () =>
            `the views were: ${titles.join(", ") || "none"}` +
            (failure === undefined ? "" : `; the last try failed: ${failure}`),
    );
    return section;
}

/** Opens `section` (a row) in the view `name` and returns the visible items. Ported from the old `commonUtils.ts`. */
export async function getTreeViewItems(name: ViewSectionType, section: string) {
    const viewSection = (await getViewSection(name)) as CustomTreeSection | undefined;
    assert(viewSection, `${name} section doesn't exist`);
    await viewSection.openItem(section);
    return viewSection.getVisibleItems();
}

/** The section's visible rows, as "label: description", or the label alone for a row without one. */
export async function rowTexts(section: CustomTreeSection): Promise<string[]> {
    return Promise.all(
        (await section.getVisibleItems()).map(async (i) => {
            const label = await i.getLabel();
            // A row without a description has no element for it, and getDescription throws.
            const description = await i.getDescription().catch(() => undefined);
            return description === undefined ? label : `${label}: ${description}`;
        }),
    );
}

/**
 * Expands the section's collapsed rows, such as the Connection view's, which
 * start collapsed. One at a time, reading the rows again after each, since
 * expanding one re-renders the ones below it.
 */
export async function expandRows(section: CustomTreeSection): Promise<void> {
    for (let i = 0; i < 10; i++) {
        let collapsed;
        for (const item of await section.getVisibleItems()) {
            if ((await item.isExpandable()) && !(await item.isExpanded())) {
                collapsed = item;
                break;
            }
        }
        if (collapsed === undefined) {
            return;
        }
        await collapsed.expand();
    }
}

/** A group of the PROJECT view: its rows are the bundle's variables, and its resources. */
export const VARIABLES = "Variables";

/** Waits until the section shows a row labelled `label`, such as the Variables group. */
export async function waitForGroup(section: CustomTreeSection, label: string, timeoutMs = 20_000) {
    await browser.waitUntil(
        async () => {
            const labels = await Promise.all(
                (await section.getVisibleItems()).map((i) => i.getLabel()),
            );
            return labels.includes(label);
        },
        { timeout: timeoutMs, interval: 200, timeoutMsg: `No "${label}" group in PROJECT` },
    );
}

/**
 * The elements matching `selector`. `$$` returns a chainable array that
 * resolves when awaited, though its type isn't awaitable, and
 * `.getElements()` doesn't exist on the global `$$`.
 */
export async function elements(selector: string): Promise<WebdriverIO.Element[]> {
    const found: WebdriverIO.Element[] = [];
    // oxlint-disable-next-line typescript/await-thenable -- see above
    for (const element of await $$(selector)) {
        found.push(element);
    }
    return found;
}
