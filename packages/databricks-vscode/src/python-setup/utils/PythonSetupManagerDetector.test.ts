import {expect} from "chai";
import {PythonSetupManagerDetector} from "./PythonSetupManagerDetector";

// A fake collector lets us drive the detector's classification wiring without
// touching disk or the MS Python extension.
describe("PythonSetupManagerDetector", () => {
    it("returns uv primary for uv-lock signals", async () => {
        const detector = new PythonSetupManagerDetector(async () => ({
            hasUvLock: true,
        }));

        const result = await detector.detect("/proj");

        expect(result.primary).to.equal("uv");
        expect(result.managers).to.deep.equal(["uv"]);
    });

    it("returns unknown with no managers for a greenfield project", async () => {
        const detector = new PythonSetupManagerDetector(async () => ({}));

        const result = await detector.detect("/proj");

        expect(result.primary).to.equal("unknown");
        expect(result.managers).to.deep.equal([]);
    });

    it("reports every co-existing manager (uv + pip)", async () => {
        const detector = new PythonSetupManagerDetector(async () => ({
            hasUvLock: true,
            hasRequirementsTxt: true,
        }));

        const result = await detector.detect("/proj");

        expect(result.primary).to.equal("uv");
        expect(result.managers).to.deep.equal(["uv", "pip"]);
    });

    it("degrades to unknown when signal collection throws", async () => {
        const detector = new PythonSetupManagerDetector(async () => {
            throw new Error("disk error");
        });

        const result = await detector.detect("/proj");

        expect(result.primary).to.equal("unknown");
        expect(result.managers).to.deep.equal([]);
    });

    it("passes the project root through to the collector", async () => {
        const seen: string[] = [];
        const detector = new PythonSetupManagerDetector(async (root) => {
            seen.push(root);
            return {};
        });

        await detector.detect("/some/where");

        expect(seen).to.deep.equal(["/some/where"]);
    });
});
