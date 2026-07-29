/* eslint-disable @typescript-eslint/naming-convention */
import {expect} from "chai";
import {collectNotebookServerlessVersions} from "./notebookServerlessVersions";

const NOTEBOOK_METADATA_KEY = "application/vnd.databricks.v1+notebook";

describe("collectNotebookServerlessVersions", () => {
    it("reads environment_version from the Databricks notebook metadata key", () => {
        const notebook = {
            metadata: {
                [NOTEBOOK_METADATA_KEY]: {
                    environmentMetadata: {environment_version: "4"},
                },
            },
            cells: [],
        };

        expect(collectNotebookServerlessVersions([notebook])).to.deep.equal([
            {version: "4", source: "notebook"},
        ]);
    });

    it("collects across multiple notebooks and dedupes, first-seen order", () => {
        const nb = (v: string) => ({
            metadata: {
                [NOTEBOOK_METADATA_KEY]: {
                    environmentMetadata: {environment_version: v},
                },
            },
        });

        expect(
            collectNotebookServerlessVersions([nb("5"), nb("4"), nb("5")])
        ).to.deep.equal([
            {version: "5", source: "notebook"},
            {version: "4", source: "notebook"},
        ]);
    });

    it("coerces a numeric environment_version to a bare string", () => {
        const notebook = {
            metadata: {
                [NOTEBOOK_METADATA_KEY]: {
                    environmentMetadata: {environment_version: 5},
                },
            },
        };

        expect(collectNotebookServerlessVersions([notebook])).to.deep.equal([
            {version: "5", source: "notebook"},
        ]);
    });

    it("ignores notebooks without the Databricks metadata key", () => {
        // A plain Jupyter notebook: no Databricks metadata block.
        const notebook = {
            metadata: {kernelspec: {name: "python3"}},
            cells: [],
        };

        expect(collectNotebookServerlessVersions([notebook])).to.deep.equal([]);
    });

    it("tolerates missing / non-object metadata without throwing", () => {
        expect(
            collectNotebookServerlessVersions([
                {},
                {metadata: null},
                {metadata: {[NOTEBOOK_METADATA_KEY]: "unresolved"}},
                undefined,
            ])
        ).to.deep.equal([]);
    });

    it("skips empty or non-scalar environment_version values", () => {
        const nb = (v: unknown) => ({
            metadata: {
                [NOTEBOOK_METADATA_KEY]: {
                    environmentMetadata: {environment_version: v},
                },
            },
        });

        expect(
            collectNotebookServerlessVersions([nb(""), nb({}), nb(null)])
        ).to.deep.equal([]);
    });

    it("returns nothing for an empty notebook list", () => {
        expect(collectNotebookServerlessVersions([])).to.deep.equal([]);
    });
});
