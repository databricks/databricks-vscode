import {expect} from "chai";
import {SpecRetryTracker} from "./SpecRetryTracker";

describe("SpecRetryTracker", () => {
    it("does not flag a spec that passes on the first attempt", () => {
        const tracker = new SpecRetryTracker();
        tracker.record("a.e2e.ts", true);
        expect(tracker.recoveredSpecs).to.deep.equal([]);
    });

    it("flags a spec that fails an attempt then passes", () => {
        const tracker = new SpecRetryTracker();
        tracker.record("a.e2e.ts", false);
        tracker.record("a.e2e.ts", true);
        expect(tracker.recoveredSpecs).to.deep.equal(["a.e2e.ts"]);
    });

    it("does not flag a spec that fails every attempt (a hard failure)", () => {
        const tracker = new SpecRetryTracker();
        tracker.record("a.e2e.ts", false);
        tracker.record("a.e2e.ts", false);
        expect(tracker.recoveredSpecs).to.deep.equal([]);
    });

    // Defensive: fail→pass→fail needs three attempts, which can't happen at
    // specFileRetries=1 (a spec runs at most twice). This guards the
    // recovered.delete branch for any future higher retry count.
    it("un-flags a spec that recovers then fails again", () => {
        const tracker = new SpecRetryTracker();
        tracker.record("a.e2e.ts", false);
        tracker.record("a.e2e.ts", true);
        tracker.record("a.e2e.ts", false);
        expect(tracker.recoveredSpecs).to.deep.equal([]);
    });

    it("tracks specs independently and lists each recovered one once", () => {
        const tracker = new SpecRetryTracker();
        tracker.record("a.e2e.ts", false);
        tracker.record("a.e2e.ts", true);
        tracker.record("b.e2e.ts", true);
        tracker.record("c.e2e.ts", false);
        tracker.record("c.e2e.ts", true);
        expect(tracker.recoveredSpecs.sort()).to.deep.equal([
            "a.e2e.ts",
            "c.e2e.ts",
        ]);
    });
});
