import {expect} from "chai";
import * as tmp from "tmp";
import path from "node:path";
import {writeFileSync} from "node:fs";
import {collectServerlessVersionObservations} from "./serverlessVersionObservations";

describe("collectServerlessVersionObservations", () => {
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

    it("collects a pyproject declaration alongside the bundle evidence", async () => {
        const root = tempProject();
        writeFileSync(
            path.join(root, "pyproject.toml"),
            '[tool.databricks.environment]\nenvironment_version = "3"\n'
        );

        const observations = await collectServerlessVersionObservations({
            getValidateConfig: async () => ({
                resources: {
                    jobs: {
                        /* eslint-disable-next-line @typescript-eslint/naming-convention */
                        j: {environments: [{spec: {environment_version: "4"}}]},
                    },
                },
            }),
            projectRoot: () => root,
        });

        expect(observations).to.deep.include.members([
            {version: "3", source: "pyproject"},
            {version: "4", source: "bundleYaml"},
        ]);
    });

    it("keeps the other sources when the pyproject read throws", async () => {
        const observations = await collectServerlessVersionObservations({
            getValidateConfig: async () => ({
                resources: {
                    jobs: {
                        /* eslint-disable-next-line @typescript-eslint/naming-convention */
                        j: {environments: [{spec: {environment_version: "4"}}]},
                    },
                },
            }),
            projectRoot: () => {
                throw new Error("no active project");
            },
        });

        expect(observations).to.deep.equal([
            {version: "4", source: "bundleYaml"},
        ]);
    });

    it("collects bundle observations from the validate config", async () => {
        const observations = await collectServerlessVersionObservations({
            getValidateConfig: async () => ({
                resources: {
                    jobs: {
                        /* eslint-disable-next-line @typescript-eslint/naming-convention */
                        j: {environments: [{spec: {environment_version: "4"}}]},
                    },
                },
            }),
            // No project root, so the notebook source contributes nothing.
            projectRoot: () => undefined,
        });

        expect(observations).to.deep.equal([
            {version: "4", source: "bundleYaml"},
        ]);
    });

    it("still returns the other source's evidence when the bundle read throws", async () => {
        // Each source is guarded independently: a failing bundle read must not
        // discard notebook evidence (that would bias the ranking toward the
        // bare fallback).
        const observations = await collectServerlessVersionObservations({
            getValidateConfig: async () => {
                throw new Error("bundle not loaded");
            },
            projectRoot: () => undefined,
        });

        expect(observations).to.deep.equal([]);
    });

    it("contributes nothing when no project is open", async () => {
        const observations = await collectServerlessVersionObservations({
            getValidateConfig: async () => undefined,
            projectRoot: () => undefined,
        });

        expect(observations).to.deep.equal([]);
    });

    it("keeps bundle evidence when the notebook scan throws", async () => {
        // The mirror of the guard above: a project root that blows up the
        // notebook scan must not discard what the bundle declared.
        const observations = await collectServerlessVersionObservations({
            getValidateConfig: async () => ({
                resources: {
                    jobs: {
                        /* eslint-disable-next-line @typescript-eslint/naming-convention */
                        j: {environments: [{spec: {environment_version: "4"}}]},
                    },
                },
            }),
            projectRoot: () => {
                throw new Error("no active project");
            },
        });

        expect(observations).to.deep.equal([
            {version: "4", source: "bundleYaml"},
        ]);
    });
});
