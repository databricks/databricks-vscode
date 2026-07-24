import {expect} from "chai";
import {
    PackageManager,
    PrimaryManager,
} from "../../language/packageManagerDetection";
import {shouldShowPythonSetup} from "./pythonSetupGate";

const det = (primary: PrimaryManager, managers: PackageManager[]) => ({
    primary,
    managers,
});

describe("shouldShowPythonSetup", () => {
    it("shows for a clean uv project when the flag is on", () => {
        expect(
            shouldShowPythonSetup({flagOn: true, detection: det("uv", ["uv"])})
        ).to.equal(true);
    });

    it("shows for an unknown/greenfield project when the flag is on", () => {
        expect(
            shouldShowPythonSetup({flagOn: true, detection: det("unknown", [])})
        ).to.equal(true);
    });

    it("hides when the flag is off, even for a clean uv project", () => {
        expect(
            shouldShowPythonSetup({flagOn: false, detection: det("uv", ["uv"])})
        ).to.equal(false);
    });

    it("hides for a pip project", () => {
        expect(
            shouldShowPythonSetup({
                flagOn: true,
                detection: det("pip", ["pip"]),
            })
        ).to.equal(false);
    });

    it("hides for a uv project that also has pip (competing manager)", () => {
        expect(
            shouldShowPythonSetup({
                flagOn: true,
                detection: det("uv", ["uv", "pip"]),
            })
        ).to.equal(false);
    });

    it("hides for a uv project running a conda interpreter", () => {
        expect(
            shouldShowPythonSetup({
                flagOn: true,
                detection: det("uv", ["uv", "conda"]),
            })
        ).to.equal(false);
    });

    it("hides for a uv project that also uses poetry", () => {
        expect(
            shouldShowPythonSetup({
                flagOn: true,
                detection: det("uv", ["uv", "poetry"]),
            })
        ).to.equal(false);
    });

    it("hides for a poetry project", () => {
        expect(
            shouldShowPythonSetup({
                flagOn: true,
                detection: det("poetry", ["poetry"]),
            })
        ).to.equal(false);
    });

    it("hides for a conda project", () => {
        expect(
            shouldShowPythonSetup({
                flagOn: true,
                detection: det("conda", ["conda"]),
            })
        ).to.equal(false);
    });
});
