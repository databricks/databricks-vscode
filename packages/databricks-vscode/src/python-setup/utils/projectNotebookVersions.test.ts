/* eslint-disable @typescript-eslint/naming-convention */
import {expect} from "chai";
import * as tmp from "tmp";
import path from "node:path";
import {mkdirSync, writeFileSync} from "node:fs";
import {collectProjectNotebookVersions} from "./projectNotebookVersions";

const NOTEBOOK_METADATA_KEY = "application/vnd.databricks.v1+notebook";

/** A minimal Databricks notebook JSON string carrying a serverless version. */
function notebookWithVersion(version: string): string {
    return JSON.stringify({
        metadata: {
            [NOTEBOOK_METADATA_KEY]: {
                environmentMetadata: {environment_version: version},
            },
        },
        cells: [],
    });
}

describe("collectProjectNotebookVersions", () => {
    const cleanups: Array<() => void> = [];
    afterEach(() => {
        while (cleanups.length) {
            cleanups.pop()!();
        }
    });

    function tempProject(): string {
        const dir = tmp.dirSync({unsafeCleanup: true});
        cleanups.push(dir.removeCallback);
        return dir.name;
    }

    /** Write a notebook at `relativePath` under `root`, creating parent dirs. */
    function writeNotebook(
        root: string,
        relativePath: string,
        version: string
    ) {
        const full = path.join(root, relativePath);
        mkdirSync(path.dirname(full), {recursive: true});
        writeFileSync(full, notebookWithVersion(version));
    }

    it("collects versions from the project's own notebooks", async () => {
        const root = tempProject();
        writeNotebook(root, "analysis.ipynb", "5");
        writeNotebook(root, "src/etl.ipynb", "4");

        const observed = await collectProjectNotebookVersions(root);

        expect(observed).to.have.deep.members([
            {version: "5", source: "notebook"},
            {version: "4", source: "notebook"},
        ]);
    });

    it("ignores notebooks under excluded dependency/venv trees", async () => {
        const root = tempProject();
        // The user's own notebook -- should be collected.
        writeNotebook(root, "notebook.ipynb", "5");
        // Notebooks shipped by dependencies / provisioned venv / build output --
        // must NOT contribute (a package's sample notebook could otherwise
        // inject a spurious, notebook-weighted version).
        writeNotebook(
            root,
            ".venv/lib/python3.12/site-packages/pkg/demo.ipynb",
            "3"
        );
        writeNotebook(root, "venv/share/example.ipynb", "3");
        writeNotebook(root, "node_modules/some-dep/nb.ipynb", "2");
        writeNotebook(root, ".git/stash.ipynb", "1");
        writeNotebook(root, ".databricks/cache.ipynb", "1");
        writeNotebook(root, "dist/bundled.ipynb", "2");
        writeNotebook(root, "build/out.ipynb", "2");

        const observed = await collectProjectNotebookVersions(root);

        expect(observed).to.deep.equal([{version: "5", source: "notebook"}]);
    });

    it("returns nothing for a project with no notebooks", async () => {
        const root = tempProject();
        expect(await collectProjectNotebookVersions(root)).to.deep.equal([]);
    });
});
