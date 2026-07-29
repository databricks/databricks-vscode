import {expect} from "chai";
import {buildVersionPickItems} from "./serverlessVersionPicker";

describe("buildVersionPickItems", () => {
    it("marks the top candidate as the recommendation and shows its provenance", () => {
        const items = buildVersionPickItems([
            {version: "4", score: 150, sources: ["bundleYaml", "notebook"]},
            {version: "5", score: 20, sources: ["workspaceDefault"]},
        ]);

        expect(items[0].version).to.equal("4");
        // `picked` is set on the top row (cosmetic in single-select, but kept
        // for completeness); the star label + first-position ordering are the
        // actual recommendation cues.
        expect(items[0].picked).to.equal(true);
        // Multi-source provenance is summarised in the description.
        expect(items[0].description).to.match(/bundle|notebook|2 source/i);
        expect(items[1].version).to.equal("5");
        expect(items[1].picked).to.equal(false);
    });

    it("labels each item with the bare version and only stars the picked one", () => {
        const items = buildVersionPickItems([
            {version: "5", score: 100, sources: ["bundleYaml"]},
            {version: "4", score: 50, sources: ["notebook"]},
        ]);

        // The picked item is visually marked; others are the plain version.
        expect(items[0].label).to.contain("5");
        expect(items[0].label).to.not.equal(items[0].version);
        expect(items[1].label).to.equal("4");
    });

    it("handles a fallback-only list", () => {
        const items = buildVersionPickItems([
            {version: "5", score: 1, sources: ["fallback"]},
        ]);

        expect(items).to.have.length(1);
        expect(items[0].version).to.equal("5");
        expect(items[0].picked).to.equal(true);
        expect(items[0].description).to.match(/fallback|default/i);
    });

    it("returns no items for an empty ranking", () => {
        expect(buildVersionPickItems([])).to.deep.equal([]);
    });
});
