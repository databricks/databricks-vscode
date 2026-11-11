import { describe, expect, it } from "vitest";
import { isDrifted } from "./driftDetection";

describe("isDrifted", () => {
    it("is true when both keys are known and differ", () => {
        expect(isDrifted("serverless/serverless-v4", "dbr/15.4.x-scala2.12")).toBe(true);
    });

    it("is false when the keys are equal", () => {
        expect(isDrifted("serverless/serverless-v5", "serverless/serverless-v5")).to.equal(false);
    });

    it("is false (fail-safe) when the current key is unknown", () => {
        expect(isDrifted("serverless/serverless-v5", undefined)).to.equal(false);
    });

    it("is false (fail-safe) when there is no persisted key", () => {
        expect(isDrifted(undefined, "dbr/15.4.x-scala2.12")).to.equal(false);
    });

    it("is false when both are unknown", () => {
        expect(isDrifted(undefined, undefined)).to.equal(false);
    });
});
