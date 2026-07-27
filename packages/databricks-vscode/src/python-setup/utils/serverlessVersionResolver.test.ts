import {expect} from "chai";
import {
    resolveServerlessVersion,
    ServerlessVersionResolverDeps,
} from "./serverlessVersionResolver";
import {ScoredVersion, VersionObservation} from "./serverlessVersionScoring";

function makeDeps(
    overrides: Partial<ServerlessVersionResolverDeps> = {}
): ServerlessVersionResolverDeps & {
    collectCalls: number;
    pickedRankings: ScoredVersion[][];
} {
    let collectCalls = 0;
    const pickedRankings: ScoredVersion[][] = [];
    const base: ServerlessVersionResolverDeps = {
        isEnabled: () => true,
        collectObservations: async () => [] as VersionObservation[],
        pick: async (ranked) => {
            pickedRankings.push(ranked);
            return ranked[0]?.version;
        },
        ...overrides,
    };
    // Wrap the (possibly overridden) collector so the call count reflects real
    // invocations regardless of which collector a test supplies.
    const collect = base.collectObservations;
    const deps: ServerlessVersionResolverDeps = {
        ...base,
        collectObservations: async () => {
            collectCalls += 1;
            return collect();
        },
    };
    const probe = deps as ServerlessVersionResolverDeps & {
        collectCalls: number;
        pickedRankings: ScoredVersion[][];
    };
    probe.pickedRankings = pickedRankings;
    // Define a *live* accessor: `Object.assign` would invoke the getter once and
    // copy its current value (0), freezing `collectCalls` at 0 and making the
    // "collection is skipped when disabled" assertion a tautology.
    Object.defineProperty(probe, "collectCalls", {
        get: () => collectCalls,
        enumerable: true,
    });
    return probe;
}

describe("resolveServerlessVersion", () => {
    it("returns undefined and does nothing when the feature is disabled", async () => {
        let picked = false;
        const deps = makeDeps({
            isEnabled: () => false,
            pick: async () => {
                picked = true;
                return "5";
            },
        });

        const version = await resolveServerlessVersion(deps);

        expect(version).to.equal(undefined);
        // The gate short-circuits before any collection or UI.
        expect(deps.collectCalls).to.equal(0);
        expect(picked).to.equal(false);
    });

    it("scores collected observations and returns the confirmed version", async () => {
        const deps = makeDeps({
            collectObservations: async () => [
                {version: "4", source: "bundleYaml"},
                {version: "6", source: "notebook"},
            ],
            pick: async (ranked) => ranked[0].version,
        });

        const version = await resolveServerlessVersion(deps);

        // bundleYaml (100) outranks notebook (50), so "4" is recommended.
        expect(version).to.equal("4");
        // The live counter proves collection actually ran (and that the
        // disabled-path assertion below is observing a real value, not a frozen
        // 0): the enabled path must collect exactly once.
        expect(deps.collectCalls).to.equal(1);
    });

    it("offers the fallback candidate even when nothing was observed", async () => {
        const deps = makeDeps({
            collectObservations: async () => [],
        });

        const version = await resolveServerlessVersion(deps);

        // The ranking handed to the picker always contains the fallback "5".
        expect(deps.pickedRankings[0].map((r) => r.version)).to.include("5");
        expect(version).to.equal("5");
    });

    it("returns undefined when the user dismisses the picker", async () => {
        const deps = makeDeps({
            collectObservations: async () => [
                {version: "5", source: "workspaceDefault"},
            ],
            pick: async () => undefined,
        });

        const version = await resolveServerlessVersion(deps);

        expect(version).to.equal(undefined);
    });
});
