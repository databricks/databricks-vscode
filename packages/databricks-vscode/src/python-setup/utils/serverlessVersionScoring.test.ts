import {expect} from "chai";
import {scoreServerlessVersions, WEIGHTS} from "./serverlessVersionScoring";

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
        expect(ranked[0].score).to.equal(WEIGHTS.bundleYaml + WEIGHTS.notebook);
        expect(ranked[0].sources).to.have.members(["bundleYaml", "notebook"]);
    });

    it("does not double-count a repeated (version, source) pair", () => {
        // Use a non-fallback version so the fallback merge does not add a
        // second source and muddy the dedup assertion.
        const ranked = scoreServerlessVersions([
            {version: "4", source: "notebook"},
            {version: "4", source: "notebook"},
        ]);
        const v4 = ranked.find((r) => r.version === "4")!;
        expect(v4.sources).to.deep.equal(["notebook"]);
        expect(v4.score).to.equal(WEIGHTS.notebook);
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
            {version: "3", source: "notebook"},
        ]);
        expect(ranked.map((r) => r.version)).to.include.members([
            "4",
            "3",
            "5",
        ]);
    });

    it("drops the `vN` display form so only the bare integer is scored", () => {
        // The CLI echoes "v5" but accepts "5"; a "v5" observation must not
        // create a second row alongside the bare fallback "5".
        const ranked = scoreServerlessVersions([
            {version: "v5", source: "bundleYaml"},
        ]);
        const fives = ranked.filter((r) => r.version === "5");
        expect(ranked.map((r) => r.version)).to.not.include("v5");
        expect(fives).to.have.length(1);
        // "v5" was dropped, so "5" is corroborated only by the fallback.
        expect(fives[0].sources).to.deep.equal(["fallback"]);
    });

    it("drops non-numeric, out-of-range and non-canonical versions", () => {
        const ranked = scoreServerlessVersions([
            {version: "abc", source: "bundleYaml"},
            {version: "", source: "notebook"},
            {version: "0", source: "bundleYaml"},
            {version: "6", source: "bundleYaml"},
            {version: "4.2", source: "notebook"},
            // Non-canonical bare integers: parse into range but are not the
            // exact string the CLI expects, so they must be dropped too.
            {version: "05", source: "bundleYaml"},
            {version: "+5", source: "notebook"},
            {version: " 5", source: "workspaceDefault"},
        ]);
        // Everything invalid is filtered; only the fallback survives.
        expect(ranked).to.have.length(1);
        expect(ranked[0].version).to.equal("5");
        expect(ranked[0].sources).to.deep.equal(["fallback"]);
    });

    it("keeps every version at the supported boundaries (1 and 5)", () => {
        const ranked = scoreServerlessVersions([
            {version: "1", source: "bundleYaml"},
            {version: "5", source: "notebook"},
        ]);
        expect(ranked.map((r) => r.version)).to.include.members(["1", "5"]);
    });
});
