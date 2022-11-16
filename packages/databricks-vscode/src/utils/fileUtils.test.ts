import assert from "assert";
import fs from "fs/promises";
import {withFile} from "tmp-promise";
import {Uri} from "vscode";
import {isNotebook} from "./fileUtils";

describe(__filename, async () => {
    it("should detect notebook", async () => {
        withFile(async (file) => {
            await fs.writeFile(
                file.path,
                Buffer.from("# Databricks notebook source\ncontent")
            );
            assert.ok(await isNotebook(Uri.parse(file.path)));
        });
    });

    it("should detect ipynb files", async () => {
        assert.ok(await isNotebook(Uri.parse("/home/fabian/hello.ipynb")));
    });

    it("should detect if not notebook", async () => {
        withFile(async (file) => {
            await fs.writeFile(file.path, Buffer.from("content"));
            assert.ok(!(await isNotebook(Uri.parse(file.path))));
        });
    });
});
