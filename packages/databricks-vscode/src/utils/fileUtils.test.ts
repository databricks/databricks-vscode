import assert from "assert";
import fs from "fs/promises";
import path from "path";
import {withDir} from "tmp-promise";
import {LocalUri} from "../sync/SyncDestination";
import {isNotebook} from "./fileUtils";

describe(__filename, async () => {
    it("should detect notebook", async () => {
        await withDir(
            async (dir) => {
                const notebookPath = path.join(dir.path, "notebook.py");
                await fs.writeFile(
                    notebookPath,
                    Buffer.from("# Databricks notebook source\ncontent")
                );
                assert.ok(await isNotebook(new LocalUri(notebookPath)));
            },
            {
                unsafeCleanup: true,
            }
        );
    });

    it("should detect ipynb files", async () => {
        assert.ok(await isNotebook(new LocalUri("/home/fabian/hello.ipynb")));
    });

    it("should detect if not notebook", async () => {
        await withDir(
            async (dir) => {
                const notebookPath = path.join(dir.path, "notebook.py");
                await fs.writeFile(notebookPath, Buffer.from("content"));
                assert.ok(!(await isNotebook(new LocalUri(notebookPath))));
            },
            {
                unsafeCleanup: true,
            }
        );
    });
});
