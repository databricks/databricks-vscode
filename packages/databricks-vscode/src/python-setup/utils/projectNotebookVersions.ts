import {readFile} from "fs/promises";
import path from "path";
import {glob} from "glob";
import {logging} from "@databricks/sdk-experimental";
import {Loggers} from "../../logger";
import {VersionObservation} from "./serverlessVersionScoring";
import {collectNotebookServerlessVersions} from "./notebookServerlessVersions";

/**
 * Directory trees excluded from the notebook scan. These hold notebooks that
 * are not the user's own project sources -- most importantly the python-setup
 * feature provisions its venv *inside* the project root (`.venv`), and Python
 * packages routinely ship example `.ipynb` files under `site-packages`, whose
 * `environment_version` would otherwise be harvested as a (notebook-weighted)
 * scoring signal. `.git`/`.databricks`/build+dependency dirs are skipped for
 * the same reason and to keep the scan cheap.
 */
const IGNORED_NOTEBOOK_DIRS = [
    "**/node_modules/**",
    "**/.venv/**",
    "**/venv/**",
    "**/site-packages/**",
    "**/.git/**",
    "**/.databricks/**",
    "**/dist/**",
    "**/build/**",
];

/**
 * Upper bound on notebooks read in a single scan. The version signal saturates
 * long before this (a handful of distinct versions across a project), so this
 * only guards the pathological case -- a repo with thousands of notebooks --
 * from turning the compute picker into a slow, memory-heavy operation. When the
 * cap is hit we scan the first `MAX_NOTEBOOKS_SCANNED` and log the rest as
 * skipped rather than silently truncating.
 */
const MAX_NOTEBOOKS_SCANNED = 200;

/**
 * How many notebooks to read+scan at once. `.ipynb` files embed cell outputs
 * (plots, images) and can be tens of MB each, so reading all of them at once
 * would spike memory; a small window bounds peak footprint while keeping the
 * scan I/O-parallel.
 */
const SCAN_CONCURRENCY = 20;

/**
 * The notebook field the collector looks for. Used here purely as a cheap
 * substring pre-filter before the expensive parse -- keep it in sync with the
 * key walked in {@link collectNotebookServerlessVersions}.
 */
const ENVIRONMENT_VERSION_FIELD = "environment_version";

/**
 * Read the project's `.ipynb` files and collect their serverless environment
 * versions as scoring observations (source `notebook`).
 *
 * Thin I/O wrapper over the pure {@link collectNotebookServerlessVersions}: it
 * finds notebooks under `projectRoot` (excluding {@link IGNORED_NOTEBOOK_DIRS}),
 * reads each (skipping any that fail to read/parse — a malformed notebook must
 * never block compute selection), and hands the parsed objects to the
 * collector. Reads run in bounded-concurrency batches and skip the JSON parse
 * for notebooks that can't declare a version (see {@link readNotebookIfVersioned}),
 * so a large repo of heavy notebooks doesn't stall the compute picker.
 */
export async function collectProjectNotebookVersions(
    projectRoot: string
): Promise<VersionObservation[]> {
    const allFiles = await glob(path.join(projectRoot, "**", "*.ipynb"), {
        // path.join uses "\" on Windows; glob wants "/", so opt out of escaping.
        windowsPathsNoEscape: true,
        ignore: IGNORED_NOTEBOOK_DIRS,
        nodir: true,
    });

    const files = allFiles.slice(0, MAX_NOTEBOOKS_SCANNED);
    if (allFiles.length > files.length) {
        logging.NamedLogger.getOrCreate(Loggers.Extension).info(
            `Serverless version scan: found ${allFiles.length} notebooks, ` +
                `scanning the first ${files.length}.`
        );
    }

    const notebooks: unknown[] = [];
    for (let i = 0; i < files.length; i += SCAN_CONCURRENCY) {
        const batch = files.slice(i, i + SCAN_CONCURRENCY);
        notebooks.push(
            ...(await Promise.all(batch.map(readNotebookIfVersioned)))
        );
    }

    return collectNotebookServerlessVersions(notebooks);
}

/**
 * Read one notebook and return its parsed JSON, or undefined if it can't
 * contribute a version. A cheap substring check runs first: a notebook whose
 * raw text doesn't even mention {@link ENVIRONMENT_VERSION_FIELD} cannot declare
 * a serverless version, so we skip the `JSON.parse` (and the large object
 * allocation a plot-heavy notebook would incur) entirely -- the common case,
 * since most notebooks have no serverless environment. Unreadable / non-JSON
 * files contribute nothing rather than throwing.
 */
async function readNotebookIfVersioned(file: string): Promise<unknown> {
    try {
        const raw = await readFile(file, "utf-8");
        if (!raw.includes(ENVIRONMENT_VERSION_FIELD)) {
            return undefined;
        }
        return JSON.parse(raw);
    } catch {
        // Unreadable / non-JSON notebook — contribute nothing.
        return undefined;
    }
}
