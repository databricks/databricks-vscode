import { readFileSync } from "node:fs";
import path, { posix } from "node:path";
import { describe, expect, it } from "vitest";
import {
    jupyterNotebookWrapper,
    notebookWrapper,
    pythonFileWrapper,
    sourceNotebookWrapper,
    wrapperPath,
} from "./workflowWrappers";

/* eslint-disable @typescript-eslint/naming-convention */

// The cases of the old `WorkspaceFsWorkflowWrapper.test.ts`, against the wrapper's content rather than a mocked import.
const RESOURCES = path.resolve(__dirname, "../../../resources/python");
const FILE_TEMPLATE = readFileSync(path.join(RESOURCES, "file.workflow-wrapper.py"), "utf-8");
const PREAMBLE = readFileSync(path.join(RESOURCES, "notebook.workflow-wrapper.py"), "utf-8");
const testDirPath = "/Users/me/testdir";
const target = (file: string) => ({
    sourceFile: `/Workspace${file}`,
    projectRoot: `/Workspace${testDirPath}`,
});

function expectedTemplate(template: string, originalFilePath: string) {
    return template
        .replace("{{DATABRICKS_SOURCE_FILE}}", `/Workspace${originalFilePath}`)
        .replace("{{DATABRICKS_PROJECT_ROOT}}", `/Workspace${testDirPath}`);
}

describe("python files", () => {
    it("should create wrapper for files", () => {
        const originalFilePath = posix.join(testDirPath, "remoteFile.py");
        const wrapper = pythonFileWrapper(
            FILE_TEMPLATE,
            originalFilePath,
            target(originalFilePath),
        );
        expect(wrapper.path).toBe(
            posix.join(testDirPath, "remoteFile.databricks.file.workflow-wrapper.py"),
        );
        expect(wrapper.runPath).toBe(wrapper.path);
        expect(wrapper.content).toBe(expectedTemplate(FILE_TEMPLATE, originalFilePath));
    });
});

describe("dbnb notebooks", () => {
    const originalFilePath = posix.join(testDirPath, "remoteFile.py");

    it("should create wrapper for databricks python notebook", () => {
        const comment = ["# Databricks notebook source"];
        const data = ["print('hello')", "print('world')"];
        const wrapper = sourceNotebookWrapper(
            comment.concat(data).join("\n"),
            PREAMBLE,
            originalFilePath,
            target(originalFilePath),
            true,
        );

        const expected = comment
            .concat(expectedTemplate(PREAMBLE, originalFilePath).split(/\r?\n/))
            .concat(["# COMMAND ----------"])
            .concat(data)
            .join("\n");
        expect(wrapper.content).toBe(expected);
        expect(wrapper.path).toBe(
            posix.join(testDirPath, "remoteFile.databricks.notebook.workflow-wrapper.py"),
        );
        // Imported with AUTO, the notebook loses its extension.
        expect(wrapper.runPath).toBe(
            posix.join(testDirPath, "remoteFile.databricks.notebook.workflow-wrapper"),
        );
    });

    it("should rearrange kernel restart commands to the beginning", () => {
        const comment = ["# Databricks notebook source"];
        const data = [
            "print('hello')",
            "print('world')",
            "# COMMAND ----------",
            "# MAGIC %pip install pandas",
            "# COMMAND ----------",
            "dbutils.library.restartPython()",
            "print('hello2')",
        ];
        const wrapper = sourceNotebookWrapper(
            comment.concat(data).join("\n"),
            PREAMBLE,
            originalFilePath,
            target(originalFilePath),
            true,
        );

        const expected = comment
            .concat([
                "import os",
                `os.chdir(os.path.dirname('/Workspace${originalFilePath}'))`,
                "# MAGIC %pip install pandas",
                "# COMMAND ----------",
                "dbutils.library.restartPython()",
                "# COMMAND ----------",
            ])
            .concat(expectedTemplate(PREAMBLE, originalFilePath).split(/\r?\n/))
            .concat([
                "# COMMAND ----------",
                "print('hello')",
                "print('world')",
                "# COMMAND ----------",
                "print('hello2')",
            ])
            .join("\n");
        expect(wrapper.content).toBe(expected);
    });

    it("keeps the cells in place when databricks.wsfs.rearrangeCells is off", () => {
        const source = [
            "# Databricks notebook source",
            "print('a')",
            "# COMMAND ----------",
            "# MAGIC %pip install pandas",
        ].join("\n");
        const wrapper = sourceNotebookWrapper(
            source,
            PREAMBLE,
            originalFilePath,
            target(originalFilePath),
            false,
        );
        expect(
            wrapper.content.endsWith(
                "# COMMAND ----------\nprint('a')\n# COMMAND ----------\n# MAGIC %pip install pandas",
            ),
        ).toBe(true);
    });
});

describe("ipynb notebooks", () => {
    const originalFilePath = posix.join(testDirPath, "remoteFile.ipynb");

    function preambleCell() {
        return {
            cell_type: "code",
            source: [expectedTemplate(PREAMBLE, originalFilePath).trimEnd()],
            metadata: { jupyter: { source_hidden: true } },
            outputs: [],
            execution_count: null,
        };
    }

    const notebookMetadata = {
        metadata: {
            "application/vnd.databricks.v1+notebook": {
                notebookName: "something",
                dashboards: [],
                notebookMetadata: { pythonIndentUnit: 4 },
                language: "python",
                widgets: {},
                notebookOrigID: 2124901766713480,
            },
        },
        nbformat: 4,
        nbformat_minor: 0,
    };

    const cellMetadata = {
        cell_type: "code",
        metadata: {
            "application/vnd.databricks.v1+cell": {
                showTitle: false,
                cellMetadata: { rowLimit: 10000, byteLimit: 2048000 },
                nuid: "1fb559af-eaf5-456f-9e12-c80b82a9baab",
                inputWidgets: {},
                title: "",
            },
        },
        outputs: [],
        execution_count: null,
    };

    const wrap = (data: unknown, rearrange = true) =>
        jupyterNotebookWrapper(
            JSON.stringify(data),
            PREAMBLE,
            originalFilePath,
            target(originalFilePath),
            rearrange,
        );

    it("should create wrapper for databricks jupyter notebook", () => {
        const originalData = {
            ...notebookMetadata,
            cells: [{ ...cellMetadata, source: ["b = 2"] }],
        };
        const wrapper = wrap(originalData);
        expect(wrapper.content).toBe(
            JSON.stringify({ ...originalData, cells: [preambleCell(), ...originalData.cells] }),
        );
        expect(wrapper.path).toBe(
            posix.join(testDirPath, "remoteFile.databricks.notebook.workflow-wrapper.ipynb"),
        );
        expect(wrapper.runPath).toBe(
            posix.join(testDirPath, "remoteFile.databricks.notebook.workflow-wrapper"),
        );
    });

    it("should create wrapper for jupyter notebook with string cell source", () => {
        const originalData = { ...notebookMetadata, cells: [{ ...cellMetadata, source: "b = 2" }] };
        expect(wrap(originalData).content).toBe(
            JSON.stringify({
                ...originalData,
                cells: [preambleCell(), { ...cellMetadata, source: ["b = 2"] }],
            }),
        );
    });

    it("should rearrange kernel restart commands to the beginning", () => {
        const originalData = {
            ...notebookMetadata,
            cells: [
                { ...cellMetadata, source: ["print('hello')"] },
                { ...cellMetadata, source: ["%pip install x"] },
                { ...cellMetadata, source: ["dbutils.library.restartPython()\nprint('hello2')\n"] },
            ],
        };
        const wrapperData = preambleCell();
        expect(wrap(originalData).content).toBe(
            JSON.stringify({
                ...notebookMetadata,
                cells: [
                    {
                        ...wrapperData,
                        source: [
                            [
                                "import os",
                                `os.chdir(os.path.dirname('/Workspace${originalFilePath}'))`,
                                "%pip install x",
                            ].join("\n"),
                        ],
                    },
                    { ...wrapperData, source: ["dbutils.library.restartPython()"] },
                    wrapperData,
                    { ...cellMetadata, source: ["print('hello')"] },
                    { ...cellMetadata, source: ["print('hello2')"] },
                ],
            }),
        );
    });

    it("keeps markdown cells as they are", () => {
        const markdown = {
            cell_type: "markdown",
            metadata: {},
            source: ["# Title\n", "%pip install not-code"],
        };
        const content = JSON.parse(wrap({ ...notebookMetadata, cells: [markdown] }).content) as {
            cells: unknown[];
        };
        expect(content.cells).toEqual([preambleCell(), markdown]);
    });
});

describe("paths", () => {
    it("keeps spaces, and escapes quotes and backslashes for the Python strings", () => {
        const file = '/Users/me/a/b c/it\'s "here"\\.py';
        const wrapper = pythonFileWrapper(FILE_TEMPLATE, file, {
            sourceFile: `/Workspace${file}`,
            projectRoot: "/Workspace/Users/me/a b",
        });
        expect(wrapper.content).toContain(
            `python_file = '/Workspace/Users/me/a/b c/it\\'s \\"here\\"\\\\.py'`,
        );
        expect(wrapper.content).toContain(`project_root = '/Workspace/Users/me/a b'`);
        expect(
            wrapperPath("/Users/me/a/b c/notebook.py", [
                "databricks",
                "notebook",
                "workflow-wrapper",
            ]),
        ).toBe("/Users/me/a/b c/notebook.databricks.notebook.workflow-wrapper.py");
    });

    it("runs a Scala, SQL or R notebook without a wrapper", () => {
        expect(
            notebookWrapper(
                "OTHER_DBNB",
                "// Databricks notebook source",
                PREAMBLE,
                "/Users/me/x.scala",
                target("/Users/me/x.scala"),
                true,
            ),
        ).toBeUndefined();
    });
});
