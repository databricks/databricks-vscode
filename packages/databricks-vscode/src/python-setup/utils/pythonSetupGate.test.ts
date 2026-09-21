import {expect} from "chai";
import {
    DetectionSignal,
    PackageManager,
    PrimaryManager,
} from "../../language/packageManagerDetection";
import {isUvSetupSuitable, resolveSetupMode} from "./pythonSetupGate";

const det = (
    primary: PrimaryManager,
    managers: PackageManager[],
    signals: DetectionSignal[] = []
) => ({
    primary,
    managers,
    signals,
});

// The single predicate behind both the visibility gate (does the uv flow show
// for this project?) and the attempt telemetry's greenfield signal. A project
// is suitable when no competing manager (pip/poetry/conda) is driving it, with
// the one exception that a pip attribution resting only on the pyproject's
// shape is discounted.
describe("isUvSetupSuitable", () => {
    it("accepts a clean uv project", () => {
        expect(isUvSetupSuitable(det("uv", ["uv"]))).to.equal(true);
    });

    it("accepts an unknown/greenfield project", () => {
        expect(isUvSetupSuitable(det("unknown", []))).to.equal(true);
    });

    it("rejects a pip project", () => {
        expect(isUvSetupSuitable(det("pip", ["pip"]))).to.equal(false);
    });

    it("rejects a poetry project", () => {
        expect(isUvSetupSuitable(det("poetry", ["poetry"]))).to.equal(false);
    });

    it("rejects a conda project", () => {
        expect(isUvSetupSuitable(det("conda", ["conda"]))).to.equal(false);
    });

    it("rejects a uv project that also has pip (competing manager)", () => {
        expect(isUvSetupSuitable(det("uv", ["uv", "pip"]))).to.equal(false);
    });

    it("rejects a uv project running a conda interpreter", () => {
        expect(isUvSetupSuitable(det("uv", ["uv", "conda"]))).to.equal(false);
    });

    it("rejects a uv project that also uses poetry", () => {
        expect(isUvSetupSuitable(det("uv", ["uv", "poetry"]))).to.equal(false);
    });

    // A packaging-shaped pyproject.toml with no [tool.uv] and no uv.lock is
    // classified as pip, which is what `databricks bundle init` generates. Those
    // projects are the ones this feature exists to set up, so that attribution
    // alone must not hide the entry.
    it("accepts a pip attribution resting only on the pyproject's shape", () => {
        expect(
            isUvSetupSuitable(det("pip", ["pip"], ["pyproject.pipOnly"]))
        ).to.equal(true);
    });

    it("still rejects when a real pip signal accompanies the pyproject", () => {
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

    it("accepts a uv project whose pip attribution is pyproject-shape only", () => {
        expect(
            isUvSetupSuitable(
                det("uv", ["uv", "pip"], ["uv.lock", "pyproject.pipOnly"])
            )
        ).to.equal(true);
    });

    it("does not discount poetry or conda alongside a shape-only pip", () => {
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
});

// The reported setup flow: manual is decisive (opted out → fallback-pip);
// on auto, uv-suitability splits uv from pip.
describe("resolveSetupMode", () => {
    it("reports fallback-pip whenever the setting is manual", () => {
        // Manual wins regardless of what the project looks like — even a clean
        // uv project, because the user turned automated setup off.
        expect(resolveSetupMode("manual", det("uv", ["uv"]))).to.equal(
            "fallback-pip"
        );
        expect(
            resolveSetupMode(
                "manual",
                det("pip", ["pip"], ["requirements.txt"])
            )
        ).to.equal("fallback-pip");
    });

    it("reports uv for an auto, uv-suitable project", () => {
        expect(resolveSetupMode("auto", det("uv", ["uv"]))).to.equal("uv");
        // Greenfield / packaging-shaped pyproject is uv-suitable too.
        expect(
            resolveSetupMode("auto", det("pip", ["pip"], ["pyproject.pipOnly"]))
        ).to.equal("uv");
    });

    it("reports pip for an auto project driven by a competing manager", () => {
        expect(
            resolveSetupMode("auto", det("pip", ["pip"], ["requirements.txt"]))
        ).to.equal("pip");
        expect(
            resolveSetupMode("auto", det("poetry", ["poetry"], ["poetry.lock"]))
        ).to.equal("pip");
        expect(
            resolveSetupMode("auto", det("conda", ["conda"], ["conda.prefix"]))
        ).to.equal("pip");
    });
});
