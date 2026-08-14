import {expect} from "chai";
import {isDrifted} from "./driftDetection";

describe("isDrifted", () => {
    it("is true when both keys are known and differ", () => {
        expect(isDrifted("serverless/serverless-v4", "dbr/15.4.x-scala2.12")).to
            .be.true;
    });

    it("is false when the keys are equal", () => {
        expect(
            isDrifted("serverless/serverless-v5", "serverless/serverless-v5")
        ).to.be.false;
    });

    it("is false (fail-safe) when the current key is unknown", () => {
        expect(isDrifted("serverless/serverless-v5", undefined)).to.be.false;
    });

    it("is false (fail-safe) when there is no persisted key", () => {
        expect(isDrifted(undefined, "dbr/15.4.x-scala2.12")).to.be.false;
    });

    it("is false when both are unknown", () => {
        expect(isDrifted(undefined, undefined)).to.be.false;
    });
});
