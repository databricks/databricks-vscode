import {expect} from "chai";
import {
    formatElapsed,
    setupProgressMessage,
    setupProgressPhase,
} from "./setupProgress";

describe("formatElapsed", () => {
    it("formats zero as 0:00", () => {
        expect(formatElapsed(0)).to.equal("0:00");
    });

    it("zero-pads seconds", () => {
        expect(formatElapsed(1000)).to.equal("0:01");
        expect(formatElapsed(9000)).to.equal("0:09");
    });

    it("rolls seconds into minutes", () => {
        expect(formatElapsed(61000)).to.equal("1:01");
        expect(formatElapsed(125000)).to.equal("2:05");
        expect(formatElapsed(600000)).to.equal("10:00");
    });

    it("truncates sub-second remainder", () => {
        expect(formatElapsed(1999)).to.equal("0:01");
    });

    it("clamps negative input to 0:00", () => {
        expect(formatElapsed(-5000)).to.equal("0:00");
    });
});

describe("setupProgressPhase", () => {
    it("walks the fast leading phases in order", () => {
        expect(setupProgressPhase(0)).to.equal("Checking prerequisites…");
        expect(setupProgressPhase(1499)).to.equal("Checking prerequisites…");
        expect(setupProgressPhase(1500)).to.equal(
            "Resolving your Databricks compute…"
        );
        expect(setupProgressPhase(3000)).to.equal(
            "Fetching matching versions and constraints…"
        );
        expect(setupProgressPhase(4500)).to.equal("Updating pyproject.toml…");
        expect(setupProgressPhase(5999)).to.equal("Updating pyproject.toml…");
    });

    it("enters the provision loop after the leading phases", () => {
        expect(setupProgressPhase(6000)).to.equal(
            "Installing the matching Python version…"
        );
    });

    it("rotates the real provision sub-steps while provisioning", () => {
        expect(setupProgressPhase(12000)).to.equal(
            "Downloading databricks-connect and dependencies…"
        );
        expect(setupProgressPhase(18000)).to.equal(
            "Resolving and syncing packages with uv…"
        );
    });

    it("loops the provision sub-steps indefinitely", () => {
        // Same message as the first provision step, one full rotation later.
        expect(setupProgressPhase(24000)).to.equal(setupProgressPhase(6000));
        expect(setupProgressPhase(24000)).to.equal(
            "Installing the matching Python version…"
        );
    });

    it("clamps negative input to the first phase", () => {
        expect(setupProgressPhase(-1000)).to.equal("Checking prerequisites…");
    });
});

describe("setupProgressMessage", () => {
    it("appends the elapsed counter to the current phase", () => {
        expect(setupProgressMessage(0)).to.equal(
            "Checking prerequisites… (0:00)"
        );
        expect(setupProgressMessage(72000)).to.equal(
            "Resolving and syncing packages with uv… (1:12)"
        );
    });
});
