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
 * Read the project's `.ipynb` files and collect their serverless environment
 * versions as scoring observations (source `notebook`).
 *
 * Thin I/O wrapper over the pure {@link collectNotebookServerlessVersions}: it
 * finds notebooks under `projectRoot` (excluding {@link IGNORED_NOTEBOOK_DIRS}),
 * JSON-parses each (skipping any that fail to read/parse — a malformed notebook
 * must never block compute selection), and hands the parsed objects to the
 * collector.
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

    const notebooks = await Promise.all(
        files.map(async (file) => {
            try {
                return JSON.parse(await readFile(file, "utf-8"));
            } catch {
                // Unreadable / non-JSON notebook — contribute nothing.
                return undefined;
            }
        })
    );

    return collectNotebookServerlessVersions(notebooks);
}
