import {expect} from "chai";
import {
    DetectionSignal,
    PackageManager,
    PrimaryManager,
} from "../../language/packageManagerDetection";
import {isUvSetupSuitable, shouldShowPythonSetup} from "./pythonSetupGate";

const det = (
    primary: PrimaryManager,
    managers: PackageManager[],
    signals: DetectionSignal[] = []
) => ({
    primary,
    managers,
    signals,
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

    // A packaging-shaped pyproject.toml with no [tool.uv] and no uv.lock is
    // classified as pip, which is what `databricks bundle init` generates. Those
    // projects are the ones this feature exists to set up, so that attribution
    // alone must not hide the entry.
    it("shows when pip was attributed only by the pyproject's shape", () => {
        expect(
            shouldShowPythonSetup({
                flagOn: true,
                detection: det("pip", ["pip"], ["pyproject.pipOnly"]),
            })
        ).to.equal(true);
    });

    it("still hides when a requirements.txt accompanies the pyproject", () => {
        expect(
            shouldShowPythonSetup({
                flagOn: true,
                detection: det(
                    "pip",
                    ["pip"],
                    ["pyproject.pipOnly", "requirements.txt"]
                ),
            })
        ).to.equal(false);
    });

    it("still hides when a constraints.txt accompanies the pyproject", () => {
        expect(
            shouldShowPythonSetup({
                flagOn: true,
                detection: det(
                    "pip",
                    ["pip"],
                    ["pyproject.pipOnly", "constraints.txt"]
                ),
            })
        ).to.equal(false);
    });

    it("still hides when a non-uv virtualenv is already the interpreter", () => {
        expect(
            shouldShowPythonSetup({
                flagOn: true,
                detection: det(
                    "pip",
                    ["pip"],
                    ["pyproject.pipOnly", "interpreter.venv"]
                ),
            })
        ).to.equal(false);
    });

    it("shows for a uv project whose pip attribution is pyproject-shape only", () => {
        expect(
            shouldShowPythonSetup({
                flagOn: true,
                detection: det(
                    "uv",
                    ["uv", "pip"],
                    ["uv.lock", "pyproject.pipOnly"]
                ),
            })
        ).to.equal(true);
    });

    it("does not discount poetry or conda alongside a shape-only pip", () => {
        expect(
            shouldShowPythonSetup({
                flagOn: true,
                detection: det(
                    "poetry",
                    ["poetry", "pip"],
                    ["poetry.lock", "pyproject.pipOnly"]
                ),
            })
        ).to.equal(false);
        expect(
            shouldShowPythonSetup({
                flagOn: true,
                detection: det(
                    "conda",
                    ["conda", "pip"],
                    ["conda.prefix", "pyproject.pipOnly"]
                ),
            })
        ).to.equal(false);
    });
});

// The shared predicate behind both the visibility gate and the attempt
// telemetry's greenfield signal. Covered directly so the contract the two
// consumers rely on is pinned independently of the flag handling above.
describe("isUvSetupSuitable", () => {
    it("accepts a clean uv project and a greenfield one", () => {
        expect(isUvSetupSuitable(det("uv", ["uv"]))).to.equal(true);
        expect(isUvSetupSuitable(det("unknown", []))).to.equal(true);
    });

    it("accepts a pip attribution resting only on the pyproject's shape", () => {
        expect(
            isUvSetupSuitable(det("pip", ["pip"], ["pyproject.pipOnly"]))
        ).to.equal(true);
    });

    it("rejects a real pip workflow", () => {
        for (const signal of [
            "requirements.txt",
            "constraints.txt",
            "interpreter.venv",
        ] as DetectionSignal[]) {
            expect(
                isUvSetupSuitable(
                    det("pip", ["pip"], ["pyproject.pipOnly", signal])
                ),
                signal
            ).to.equal(false);
        }
    });

    it("rejects poetry and conda even alongside a shape-only pip", () => {
        expect(
            isUvSetupSuitable(
                det(
                    "poetry",
                    ["poetry", "pip"],
                    ["poetry.lock", "pyproject.pipOnly"]
                )
            )
        ).to.equal(false);
        expect(
            isUvSetupSuitable(
                det(
                    "conda",
                    ["conda", "pip"],
                    ["conda.prefix", "pyproject.pipOnly"]
                )
            )
        ).to.equal(false);
    });

    it("agrees with the gate whenever the flag is on", () => {
        const cases = [
            det("uv", ["uv"]),
            det("unknown", []),
            det("pip", ["pip"], ["pyproject.pipOnly"]),
            det("pip", ["pip"], ["requirements.txt"]),
            det("poetry", ["poetry"], ["poetry.lock"]),
            det("conda", ["conda"], ["conda.prefix"]),
        ];
        for (const detection of cases) {
            expect(
                shouldShowPythonSetup({flagOn: true, detection}),
                JSON.stringify(detection.signals)
            ).to.equal(isUvSetupSuitable(detection));
        }
    });
});
