import {expect} from "chai";
import {
    scoreServerlessVersions,
    WEIGHTS,
} from "./serverlessVersionScoring";

describe("scoreServerlessVersions", () => {
    it("ranks the version with the most weight first", () => {
        // bundleYaml outweighs workspaceDefault, so v4 wins despite v5 being
        // numerically higher.
        const ranked = scoreServerlessVersions([
            {version: "4", source: "bundleYaml"},
            {version: "5", source: "workspaceDefault"},
        ]);
        expect(ranked[0].version).to.equal("4");
    });

    it("adds weight when multiple sources agree on a version", () => {
        const ranked = scoreServerlessVersions([
            {version: "4", source: "bundleYaml"},
            {version: "4", source: "notebook"},
            {version: "5", source: "bundleYaml"},
        ]);
        expect(ranked[0].version).to.equal("4");
        expect(ranked[0].score).to.equal(
            WEIGHTS.bundleYaml + WEIGHTS.notebook
        );
        expect(ranked[0].sources).to.have.members(["bundleYaml", "notebook"]);
    });

    it("does not double-count a repeated (version, source) pair", () => {
        // Use a non-fallback version so the fallback merge does not add a
        // second source and muddy the dedup assertion.
        const ranked = scoreServerlessVersions([
            {version: "6", source: "notebook"},
            {version: "6", source: "notebook"},
        ]);
        const v6 = ranked.find((r) => r.version === "6")!;
        expect(v6.sources).to.deep.equal(["notebook"]);
        expect(v6.score).to.equal(WEIGHTS.notebook);
    });

    it("breaks ties by higher numeric version", () => {
        const ranked = scoreServerlessVersions([
            {version: "4", source: "notebook"},
            {version: "5", source: "notebook"},
        ]);
        expect(ranked[0].version).to.equal("5");
    });

    it("always includes the fallback candidate, even with no observations", () => {
        const ranked = scoreServerlessVersions([]);
        expect(ranked).to.have.length(1);
        expect(ranked[0].version).to.equal("5");
        expect(ranked[0].sources).to.deep.equal(["fallback"]);
    });

    it("merges the fallback into a matching observed version instead of duplicating it", () => {
        // An observation for the fallback version itself must not produce two
        // "5" rows -- it is one candidate corroborated by two sources.
        const ranked = scoreServerlessVersions([
            {version: "5", source: "bundleYaml"},
        ]);
        const fives = ranked.filter((r) => r.version === "5");
        expect(fives).to.have.length(1);
        expect(fives[0].sources).to.have.members(["bundleYaml", "fallback"]);
    });

    it("surfaces disagreeing versions all in the ranked list", () => {
        const ranked = scoreServerlessVersions([
            {version: "4", source: "bundleYaml"},
            {version: "6", source: "notebook"},
        ]);
        expect(ranked.map((r) => r.version)).to.include.members([
            "4",
            "6",
            "5",
        ]);
    });
});
