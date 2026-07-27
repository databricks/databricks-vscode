import {expect} from "chai";
import {makePythonSetupVisibility, resolveComputeFrom} from "./pythonSetupDeps";

describe("makePythonSetupVisibility", () => {
    const uvDetection = {primary: "uv" as const, managers: ["uv" as const]};

    it("is hidden when the feature flag is off, regardless of project", async () => {
        const isVisible = makePythonSetupVisibility({
            isEnabled: () => false,
            detect: async () => uvDetection,
            projectRoot: () => "/proj",
        });
        expect(await isVisible()).to.equal(false);
    });

    it("is hidden when there is no open project", async () => {
        const isVisible = makePythonSetupVisibility({
            isEnabled: () => true,
            detect: async () => uvDetection,
            projectRoot: () => undefined,
        });
        expect(await isVisible()).to.equal(false);
    });

    it("is visible for a clean uv project when opted in", async () => {
        const isVisible = makePythonSetupVisibility({
            isEnabled: () => true,
            detect: async () => uvDetection,
            projectRoot: () => "/proj",
        });
        expect(await isVisible()).to.equal(true);
    });

    it("is hidden for a project with a competing manager", async () => {
        const isVisible = makePythonSetupVisibility({
            isEnabled: () => true,
            detect: async () => ({primary: "uv", managers: ["uv", "pip"]}),
            projectRoot: () => "/proj",
        });
        expect(await isVisible()).to.equal(false);
    });
});

describe("resolveComputeFrom", () => {
    it("returns a cluster target when a cluster is attached", () => {
        expect(
            resolveComputeFrom({
                serverless: false,
                cluster: {id: "0101-clusterid"},
                serverlessVersion: undefined,
            })
        ).to.deep.equal({kind: "cluster", clusterId: "0101-clusterid"});
    });

    it("returns a serverless target with the persisted version", () => {
        expect(
            resolveComputeFrom({
                serverless: true,
                cluster: undefined,
                serverlessVersion: "5",
            })
        ).to.deep.equal({kind: "serverless", version: "5"});
    });

    it("returns undefined for serverless without a chosen version", () => {
        // A version-less serverless selection cannot be provisioned yet -- the
        // compute picker sub-step (or a fallback) supplies the version.
        expect(
            resolveComputeFrom({
                serverless: true,
                cluster: undefined,
                serverlessVersion: undefined,
            })
        ).to.equal(undefined);
    });

    it("returns undefined when no compute is selected", () => {
        expect(
            resolveComputeFrom({
                serverless: false,
                cluster: undefined,
                serverlessVersion: undefined,
            })
        ).to.equal(undefined);
    });

    it("prefers a cluster over a stale serverless version", () => {
        // Cluster attached wins; the serverless version is irrelevant then.
        expect(
            resolveComputeFrom({
                serverless: false,
                cluster: {id: "c1"},
                serverlessVersion: "5",
            })
        ).to.deep.equal({kind: "cluster", clusterId: "c1"});
    });
});
