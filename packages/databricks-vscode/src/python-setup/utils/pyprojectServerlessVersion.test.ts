/* eslint-disable @typescript-eslint/naming-convention */
import {expect} from "chai";
import * as tmp from "tmp";
import path from "node:path";
import {writeFileSync} from "node:fs";
import {
    collectPyprojectServerlessVersion,
    collectProjectPyprojectVersion,
} from "./pyprojectServerlessVersion";

describe("collectPyprojectServerlessVersion", () => {
    it("reads environment_version from the canonical table", () => {
        const contents = [
            "[tool.databricks.environment]",
            'environment_version = "4"',
            "",
        ].join("\n");

        expect(collectPyprojectServerlessVersion(contents)).to.deep.equal([
            {version: "4", source: "pyproject"},
        ]);
    });

    it("tolerates surrounding whitespace, comments and single quotes", () => {
        const contents = [
            "# project config",
            "[project]",
            'name = "x"',
            "",
            "  [ tool.databricks.environment ]  # serverless env",
            "   environment_version =   '5'   # pinned",
            "",
        ].join("\r\n");

        expect(collectPyprojectServerlessVersion(contents)).to.deep.equal([
            {version: "5", source: "pyproject"},
        ]);
    });

    it("accepts an unquoted (numeric) value", () => {
        const contents = [
            "[tool.databricks.environment]",
            "environment_version = 3",
        ].join("\n");

        expect(collectPyprojectServerlessVersion(contents)).to.deep.equal([
            {version: "3", source: "pyproject"},
        ]);
    });

    it("ignores environment_version outside the databricks environment table", () => {
        // A key of the same name in another table must never be harvested.
        const contents = [
            "[tool.other]",
            'environment_version = "2"',
            "",
            "[project]",
            'name = "x"',
        ].join("\n");

        expect(collectPyprojectServerlessVersion(contents)).to.deep.equal([]);
    });

    it("stops reading the table at the next header", () => {
        // A key that appears only after a subsequent table header is no longer
        // part of [tool.databricks.environment].
        const contents = [
            "[tool.databricks.environment]",
            'base_environment = "x"',
            "",
            "[tool.databricks.environment.extra]",
            'environment_version = "2"',
        ].join("\n");

        expect(collectPyprojectServerlessVersion(contents)).to.deep.equal([]);
    });

    it("ignores a commented-out table header", () => {
        const contents = [
            "# [tool.databricks.environment]",
            'environment_version = "4"',
        ].join("\n");

        expect(collectPyprojectServerlessVersion(contents)).to.deep.equal([]);
    });

    it("does not match a key that merely ends with environment_version", () => {
        const contents = [
            "[tool.databricks.environment]",
            'my_environment_version = "4"',
        ].join("\n");

        expect(collectPyprojectServerlessVersion(contents)).to.deep.equal([]);
    });

    it("returns nothing when the table or key is absent", () => {
        expect(collectPyprojectServerlessVersion(undefined)).to.deep.equal([]);
        expect(collectPyprojectServerlessVersion("")).to.deep.equal([]);
        expect(
            collectPyprojectServerlessVersion('[project]\nname = "x"\n')
        ).to.deep.equal([]);
        expect(
            collectPyprojectServerlessVersion("[tool.databricks.environment]\n")
        ).to.deep.equal([]);
    });

    it("skips an empty value", () => {
        const contents = [
            "[tool.databricks.environment]",
            'environment_version = ""',
        ].join("\n");

        expect(collectPyprojectServerlessVersion(contents)).to.deep.equal([]);
    });
});

describe("collectProjectPyprojectVersion", () => {
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

    it("reads the version from a project's pyproject.toml", async () => {
        const root = tempProject();
        writeFileSync(
            path.join(root, "pyproject.toml"),
            '[tool.databricks.environment]\nenvironment_version = "4"\n'
        );

        expect(await collectProjectPyprojectVersion(root)).to.deep.equal([
            {version: "4", source: "pyproject"},
        ]);
    });

    it("contributes nothing when pyproject.toml is absent", async () => {
        const root = tempProject();
        expect(await collectProjectPyprojectVersion(root)).to.deep.equal([]);
    });
});
