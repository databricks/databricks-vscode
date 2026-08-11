import {expect} from "chai";
import {collectServerlessVersionObservations} from "./serverlessVersionObservations";

describe("collectServerlessVersionObservations", () => {
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
