import { describe, expect, it } from "vitest";
import { useTempDirs } from "../../test-support/tempDir";
import { notebookType } from "./notebooks";

const tempDir = useTempDirs();

// The notebook-detection cases of the old `fileUtils.test.ts`, and the other languages.
describe("notebookType", () => {
    it("should detect notebook", async () => {
        expect(
            await notebookType(
                tempDir().write("notebook.py", "# Databricks notebook source\ncontent"),
            ),
        ).toBe("PY_DBNB");
    });

    it("should detect ipynb files", async () => {
        expect(await notebookType("/home/me/hello.ipynb")).toBe("IPYNB");
    });

    it("should detect if not notebook", async () => {
        expect(await notebookType(tempDir().write("notebook.py", "content"))).toBeUndefined();
    });

    it("detects Scala, SQL and R notebooks by their comment, and nothing else", async () => {
        const t = tempDir();
        expect(await notebookType(t.write("a.scala", "// Databricks notebook source\n"))).toBe(
            "OTHER_DBNB",
        );
        expect(await notebookType(t.write("a.sql", "-- Databricks notebook source\n"))).toBe(
            "OTHER_DBNB",
        );
        expect(await notebookType(t.write("a.r", "# Databricks notebook source\n"))).toBe(
            "OTHER_DBNB",
        );
        expect(
            await notebookType(t.write("a.sql", "# Databricks notebook source\n")),
        ).toBeUndefined();
        expect(
            await notebookType(t.write("a.txt", "# Databricks notebook source\n")),
        ).toBeUndefined();
        expect(await notebookType(t.write("short.py", "#"))).toBeUndefined();
    });
});
