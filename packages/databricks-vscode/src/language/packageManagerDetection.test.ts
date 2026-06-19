import {expect} from "chai";
import {
    detectPackageManagers,
    interpreterUnderCondaPrefix,
    PackageManagerSignals,
    pyprojectHasToolSection,
    pyvenvCfgMarksUv,
} from "./packageManagerDetection";

describe("detectPackageManagers", () => {
    describe("single manager", () => {
        it("detects uv from uv.lock", () => {
            const result = detectPackageManagers({hasUvLock: true});
            expect(result.managers).to.deep.equal(["uv"]);
            expect(result.primary).to.equal("uv");
            expect(result.signals).to.deep.equal(["uv.lock"]);
            expect(result.hasLockfile).to.equal(true);
        });

        it("detects uv from [tool.uv] in pyproject", () => {
            const result = detectPackageManagers({hasPyprojectToolUv: true});
            expect(result.managers).to.deep.equal(["uv"]);
            expect(result.primary).to.equal("uv");
            expect(result.signals).to.deep.equal(["pyproject.tool.uv"]);
            expect(result.hasLockfile).to.equal(false);
        });

        it("detects poetry from poetry.lock", () => {
            const result = detectPackageManagers({hasPoetryLock: true});
            expect(result.managers).to.deep.equal(["poetry"]);
            expect(result.primary).to.equal("poetry");
            expect(result.signals).to.deep.equal(["poetry.lock"]);
            expect(result.hasLockfile).to.equal(true);
        });

        it("detects pip from requirements.txt", () => {
            const result = detectPackageManagers({hasRequirementsTxt: true});
            expect(result.managers).to.deep.equal(["pip"]);
            expect(result.primary).to.equal("pip");
            expect(result.signals).to.deep.equal(["requirements.txt"]);
            expect(result.hasLockfile).to.equal(false);
        });

        it("detects pip from constraints.txt", () => {
            const result = detectPackageManagers({hasConstraintsTxt: true});
            expect(result.managers).to.deep.equal(["pip"]);
            expect(result.primary).to.equal("pip");
            expect(result.signals).to.deep.equal(["constraints.txt"]);
        });

        it("detects pip from a pip-only pyproject", () => {
            const result = detectPackageManagers({hasPyprojectPipOnly: true});
            expect(result.managers).to.deep.equal(["pip"]);
            expect(result.primary).to.equal("pip");
            expect(result.signals).to.deep.equal(["pyproject.pipOnly"]);
        });

        it("detects conda from environment.yml", () => {
            const result = detectPackageManagers({hasCondaEnvFile: true});
            expect(result.managers).to.deep.equal(["conda"]);
            expect(result.primary).to.equal("conda");
            expect(result.signals).to.deep.equal(["environment.yml"]);
        });

        it("detects conda from an active CONDA_PREFIX", () => {
            const result = detectPackageManagers({hasCondaPrefix: true});
            expect(result.managers).to.deep.equal(["conda"]);
            expect(result.primary).to.equal("conda");
            expect(result.signals).to.deep.equal(["conda.prefix"]);
        });
    });

    describe("interpreter source", () => {
        it("attributes uv from a uv-created interpreter", () => {
            const result = detectPackageManagers({interpreterSource: "uv"});
            expect(result.managers).to.deep.equal(["uv"]);
            expect(result.primary).to.equal("uv");
            expect(result.signals).to.deep.equal(["interpreter.uv"]);
            expect(result.interpreterSource).to.equal("uv");
        });

        it("attributes conda from a conda interpreter", () => {
            const result = detectPackageManagers({interpreterSource: "conda"});
            expect(result.managers).to.deep.equal(["conda"]);
            expect(result.primary).to.equal("conda");
            expect(result.signals).to.deep.equal(["interpreter.conda"]);
            expect(result.interpreterSource).to.equal("conda");
        });

        it("attributes pip from a plain venv interpreter", () => {
            const result = detectPackageManagers({interpreterSource: "venv"});
            expect(result.managers).to.deep.equal(["pip"]);
            expect(result.primary).to.equal("pip");
            expect(result.signals).to.deep.equal(["interpreter.venv"]);
            expect(result.interpreterSource).to.equal("venv");
        });

        it("defaults interpreterSource to unknown when absent", () => {
            const result = detectPackageManagers({hasUvLock: true});
            expect(result.interpreterSource).to.equal("unknown");
        });
    });

    describe("overlaps", () => {
        it("reports both uv and pip (uv.lock + requirements.txt)", () => {
            const result = detectPackageManagers({
                hasUvLock: true,
                hasRequirementsTxt: true,
            });
            expect(result.managers).to.deep.equal(["uv", "pip"]);
            // uv outranks pip as primary.
            expect(result.primary).to.equal("uv");
            expect(result.signals).to.deep.equal([
                "uv.lock",
                "requirements.txt",
            ]);
            expect(result.hasLockfile).to.equal(true);
        });

        it("reports both conda and pip (environment.yml + requirements.txt)", () => {
            const result = detectPackageManagers({
                hasCondaEnvFile: true,
                hasRequirementsTxt: true,
            });
            expect(result.managers).to.deep.equal(["conda", "pip"]);
            // conda outranks pip as primary.
            expect(result.primary).to.equal("conda");
            expect(result.signals).to.deep.equal([
                "requirements.txt",
                "environment.yml",
            ]);
        });

        it("reports both poetry and uv (both pyproject sections)", () => {
            const result = detectPackageManagers({
                hasPyprojectToolUv: true,
                hasPyprojectToolPoetry: true,
            });
            expect(result.managers).to.deep.equal(["uv", "poetry"]);
            // uv outranks poetry as primary.
            expect(result.primary).to.equal("uv");
            expect(result.signals).to.deep.equal([
                "pyproject.tool.uv",
                "pyproject.tool.poetry",
            ]);
        });

        it("orders primary uv > poetry > conda > pip when all apply", () => {
            const result = detectPackageManagers({
                hasUvLock: true,
                hasPoetryLock: true,
                hasCondaEnvFile: true,
                hasRequirementsTxt: true,
            });
            expect(result.managers).to.deep.equal([
                "uv",
                "poetry",
                "conda",
                "pip",
            ]);
            expect(result.primary).to.equal("uv");
            expect(result.hasLockfile).to.equal(true);
        });
    });

    describe("weak signals", () => {
        it("records uv/poetry on PATH without attributing the project", () => {
            const result = detectPackageManagers({
                uvOnPath: true,
                poetryOnPath: true,
            });
            // A tool merely installed on PATH is not project usage.
            expect(result.managers).to.deep.equal([]);
            expect(result.primary).to.equal("unknown");
            expect(result.signals).to.deep.equal([
                "uv.onPath",
                "poetry.onPath",
            ]);
        });

        it("promotes uv to a manager when PATH is joined by a lockfile", () => {
            const result = detectPackageManagers({
                uvOnPath: true,
                hasUvLock: true,
            });
            expect(result.managers).to.deep.equal(["uv"]);
            expect(result.primary).to.equal("uv");
            expect(result.signals).to.deep.equal(["uv.lock", "uv.onPath"]);
        });

        it("keeps the real interpreter source for a uv project on a conda interpreter", () => {
            // A uv.lock project where the user has not yet selected a
            // uv-managed interpreter: uv is the project manager, but the
            // interpreter source must reflect the actually-active conda env so
            // the setup-flow gap stays visible (not masked as interpreter.uv).
            const result = detectPackageManagers({
                hasUvLock: true,
                interpreterSource: "conda",
            });
            expect(result.managers).to.deep.equal(["uv", "conda"]);
            expect(result.primary).to.equal("uv");
            expect(result.interpreterSource).to.equal("conda");
            expect(result.signals).to.deep.equal([
                "uv.lock",
                "interpreter.conda",
            ]);
        });
    });

    describe("none", () => {
        it("returns unknown for empty signals", () => {
            const result = detectPackageManagers({});
            expect(result.managers).to.deep.equal([]);
            expect(result.primary).to.equal("unknown");
            expect(result.signals).to.deep.equal([]);
            expect(result.hasLockfile).to.equal(false);
            expect(result.interpreterSource).to.equal("unknown");
        });

        it("returns unknown when only an unknown interpreter is present", () => {
            const signals: PackageManagerSignals = {
                interpreterSource: "unknown",
            };
            const result = detectPackageManagers(signals);
            expect(result.managers).to.deep.equal([]);
            expect(result.primary).to.equal("unknown");
        });
    });
});

describe("pyprojectHasToolSection", () => {
    it("returns false for undefined contents", () => {
        expect(pyprojectHasToolSection(undefined, "uv")).to.equal(false);
    });

    it("matches a bare [tool.uv] header", () => {
        expect(pyprojectHasToolSection("[tool.uv]\n", "uv")).to.equal(true);
    });

    it("matches a [tool.poetry] header", () => {
        const toml = '[tool.poetry]\nname = "x"\n';
        expect(pyprojectHasToolSection(toml, "poetry")).to.equal(true);
    });

    it("matches subtable-only headers (no bare [tool.uv])", () => {
        // Real uv projects often have only subtables.
        expect(pyprojectHasToolSection("[tool.uv.sources]\n", "uv")).to.equal(
            true
        );
        expect(
            pyprojectHasToolSection(
                "[tool.poetry.group.dev.dependencies]\n",
                "poetry"
            )
        ).to.equal(true);
    });

    it("tolerates whitespace inside the header brackets", () => {
        expect(pyprojectHasToolSection("[ tool.uv ]\n", "uv")).to.equal(true);
    });

    it("ignores a commented-out header", () => {
        expect(pyprojectHasToolSection("# [tool.uv]\n", "uv")).to.equal(false);
        expect(
            pyprojectHasToolSection("  #[tool.poetry]\n", "poetry")
        ).to.equal(false);
    });

    it("ignores trailing comments after an unrelated header", () => {
        const toml = "[project] # not [tool.uv]\n";
        expect(pyprojectHasToolSection(toml, "uv")).to.equal(false);
    });

    it("does not match tool.uv mentioned inside a value or key", () => {
        expect(
            pyprojectHasToolSection('description = "use [tool.uv]"\n', "uv")
        ).to.equal(false);
        expect(
            pyprojectHasToolSection('urls."tool.uv" = "x"\n', "uv")
        ).to.equal(false);
    });

    it("does not match a different tool's section", () => {
        expect(pyprojectHasToolSection("[tool.ruff]\n", "uv")).to.equal(false);
        // Prefix collision: [tool.uvicorn] must not count as [tool.uv].
        expect(pyprojectHasToolSection("[tool.uvicorn]\n", "uv")).to.equal(
            false
        );
    });

    it("matches array-of-table headers ([[...]])", () => {
        expect(pyprojectHasToolSection("[[tool.uv.index]]\n", "uv")).to.equal(
            true
        );
        expect(
            pyprojectHasToolSection("[[tool.poetry.source]]\n", "poetry")
        ).to.equal(true);
        // Bare array-of-table form as well.
        expect(pyprojectHasToolSection("[[tool.uv]]\n", "uv")).to.equal(true);
    });

    it("does not match array-of-table prefix collisions", () => {
        expect(pyprojectHasToolSection("[[tool.uvicorn.x]]\n", "uv")).to.equal(
            false
        );
    });
});

describe("pyvenvCfgMarksUv", () => {
    it("returns false for undefined contents", () => {
        expect(pyvenvCfgMarksUv(undefined)).to.equal(false);
    });

    it("detects a uv = <version> line", () => {
        const cfg = "home = /usr/bin\nversion = 3.11.4\nuv = 0.4.18\n";
        expect(pyvenvCfgMarksUv(cfg)).to.equal(true);
    });

    it("tolerates whitespace around the uv key", () => {
        expect(pyvenvCfgMarksUv("  uv   =   0.5.0\n")).to.equal(true);
    });

    it("returns false for a plain (non-uv) venv config", () => {
        const cfg =
            "home = /usr/bin\ninclude-system-site-packages = false\nversion = 3.11.4\n";
        expect(pyvenvCfgMarksUv(cfg)).to.equal(false);
    });

    it("does not match uv appearing in another key or value", () => {
        expect(pyvenvCfgMarksUv("command = /x/uv venv\n")).to.equal(false);
        expect(pyvenvCfgMarksUv("uv_seed = true\n")).to.equal(false);
    });
});

describe("interpreterUnderCondaPrefix", () => {
    it("returns false when either path is missing", () => {
        expect(interpreterUnderCondaPrefix(undefined, "/opt/conda")).to.equal(
            false
        );
        expect(interpreterUnderCondaPrefix("/opt/conda", undefined)).to.equal(
            false
        );
    });

    it("matches when sysPrefix equals the conda prefix", () => {
        expect(
            interpreterUnderCondaPrefix(
                "/opt/conda/envs/ml",
                "/opt/conda/envs/ml"
            )
        ).to.equal(true);
    });

    it("matches when the interpreter is nested under the prefix", () => {
        expect(
            interpreterUnderCondaPrefix("/opt/conda/envs/ml/bin", "/opt/conda")
        ).to.equal(true);
    });

    it("tolerates a trailing separator on either path", () => {
        expect(
            interpreterUnderCondaPrefix(
                "/opt/conda/envs/ml/",
                "/opt/conda/envs/ml"
            )
        ).to.equal(true);
    });

    it("does not match on a shared path prefix that is not a boundary", () => {
        // /x/envs/ab must not be treated as inside /x/envs/a.
        expect(interpreterUnderCondaPrefix("/x/envs/ab", "/x/envs/a")).to.equal(
            false
        );
    });

    it("does not match an unrelated interpreter (shell-global CONDA_PREFIX)", () => {
        // The conda env is active in the shell, but the selected interpreter
        // is a uv/venv elsewhere -- must not be attributed to conda.
        expect(
            interpreterUnderCondaPrefix(
                "/home/u/project/.venv",
                "/opt/conda/envs/base"
            )
        ).to.equal(false);
    });

    it("handles Windows-style separators", () => {
        expect(
            interpreterUnderCondaPrefix(
                "C:\\conda\\envs\\ml",
                "C:\\conda\\envs\\ml"
            )
        ).to.equal(true);
        expect(
            interpreterUnderCondaPrefix("C:\\conda\\envs\\ml\\x", "C:\\conda")
        ).to.equal(true);
    });
});
