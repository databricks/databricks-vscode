import {readFile} from "fs/promises";
import path from "path";
import {glob} from "glob";
import {VersionObservation} from "./serverlessVersionScoring";
import {collectNotebookServerlessVersions} from "./notebookServerlessVersions";

/**
 * Read the project's `.ipynb` files and collect their serverless environment
 * versions as scoring observations (source `notebook`).
 *
 * Thin I/O wrapper over the pure {@link collectNotebookServerlessVersions}: it
 * finds notebooks under `projectRoot`, JSON-parses each (skipping any that fail
 * to read/parse — a malformed notebook must never block compute selection), and
 * hands the parsed objects to the collector. `node_modules` is excluded so we
 * don't scan dependency notebooks.
 */
export async function collectProjectNotebookVersions(
    projectRoot: string
): Promise<VersionObservation[]> {
    const files = await glob(path.join(projectRoot, "**", "*.ipynb"), {
        // path.join uses "\" on Windows; glob wants "/", so opt out of escaping.
        windowsPathsNoEscape: true,
        ignore: "**/node_modules/**",
        nodir: true,
    });

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
