import {expect} from "chai";
import path from "node:path";
import {PythonSetupAdoption} from "../../telemetry/pythonSetupExtensions";
import {
    PythonSetupAdoptionDeps,
    PythonSetupAdoptionManager,
} from "./PythonSetupAdoptionManager";

function makeDeps(over: Partial<PythonSetupAdoptionDeps> = {}): {
    deps: PythonSetupAdoptionDeps;
    recorded: PythonSetupAdoption[];
} {
    const recorded: PythonSetupAdoption[] = [];
    const deps: PythonSetupAdoptionDeps = {
        projectRoot: () => "/ws/project",
        isAttributable: () => true,
        isVpexActive: () => true,
        getTargetType: () => "serverless",
        savedSetup: () => undefined,
        venvExists: () => true,
        record: (r) => recorded.push(r),
        ...over,
    };
    return {deps, recorded};
}

describe("PythonSetupAdoptionManager", () => {
    it("emits the adoption gauge once for a VPEX-active project", () => {
        const {deps, recorded} = makeDeps();
        new PythonSetupAdoptionManager(deps).report();
        expect(recorded).to.deep.equal([
            {venvPresent: true, currentTargetType: "serverless"},
        ]);
    });

    it("reports an absent venv as venvPresent=false", () => {
        const {deps, recorded} = makeDeps({venvExists: () => false});
        new PythonSetupAdoptionManager(deps).report();
        expect(recorded).to.deep.equal([
            {venvPresent: false, currentTargetType: "serverless"},
        ]);
    });

    it("checks the venv folder that the last setup saved", () => {
        // A uv workspace member shares the venv at the workspace root.
        const checked: string[] = [];
        const {deps} = makeDeps({
            projectRoot: () => "/mono/bundles/sales",
            savedSetup: () => ({
                projectRoot: "/mono/bundles/sales",
                venvPath: "/mono/.venv",
            }),
            venvExists: (venvDir) => {
                checked.push(venvDir);
                return true;
            },
        });
        new PythonSetupAdoptionManager(deps).report();
        expect(checked).to.deep.equal(["/mono/.venv"]);
    });

    it("does not emit while the saved setup belongs to another project", () => {
        // Two bundles in one workspace folder: the state is from bundle A.
        let root = "/ws/b";
        const {deps, recorded} = makeDeps({
            projectRoot: () => root,
            savedSetup: () => ({projectRoot: "/ws/a", venvPath: "/ws/a/.venv"}),
        });
        const manager = new PythonSetupAdoptionManager(deps);
        manager.report();
        expect(recorded).to.deep.equal([]);
        // Not latched: switching to A still emits.
        root = "/ws/a";
        manager.report();
        expect(recorded).to.have.length(1);
    });

    it("checks <project>/.venv when the saved state has no venv folder", () => {
        const checked: string[] = [];
        const {deps} = makeDeps({
            venvExists: (venvDir) => {
                checked.push(venvDir);
                return true;
            },
        });
        new PythonSetupAdoptionManager(deps).report();
        expect(checked).to.deep.equal([path.join("/ws/project", ".venv")]);
    });

    it("passes through the attached compute kind, including none", () => {
        const {deps, recorded} = makeDeps({getTargetType: () => "none"});
        new PythonSetupAdoptionManager(deps).report();
        expect(recorded[0].currentTargetType).to.equal("none");
    });

    it("dedupes: repeated report() calls emit at most once per session", () => {
        const {deps, recorded} = makeDeps();
        const reporter = new PythonSetupAdoptionManager(deps);
        reporter.report();
        reporter.report();
        reporter.report();
        expect(recorded).to.have.length(1);
    });

    it("does not emit when no project root is resolvable", () => {
        const {deps, recorded} = makeDeps({projectRoot: () => undefined});
        new PythonSetupAdoptionManager(deps).report();
        expect(recorded).to.be.empty;
    });

    it("does not emit when the project is not VPEX-active (no setup on record)", () => {
        const {deps, recorded} = makeDeps({isVpexActive: () => false});
        new PythonSetupAdoptionManager(deps).report();
        expect(recorded).to.be.empty;
    });

    it("does not emit when attribution is ambiguous (multi-root workspace)", () => {
        // The shared setupState key could belong to another root, so emitting
        // here would risk a spurious venvPresent=false. It must not latch either,
        // so the workspace becoming single-root later can still report.
        let attributable = false;
        const {deps, recorded} = makeDeps({
            isAttributable: () => attributable,
        });
        const reporter = new PythonSetupAdoptionManager(deps);
        reporter.report();
        expect(recorded).to.be.empty;
        attributable = true;
        reporter.report();
        expect(recorded).to.have.length(1);
    });

    it("re-checks VPEX-active on later calls until it can emit, then dedupes", () => {
        // A setup can complete mid-session: the not-active early return must not
        // latch the dedup, or a project that becomes VPEX-active would never be
        // reported.
        let active = false;
        const {deps, recorded} = makeDeps({isVpexActive: () => active});
        const reporter = new PythonSetupAdoptionManager(deps);
        reporter.report();
        expect(recorded).to.be.empty;
        active = true;
        reporter.report();
        reporter.report();
        expect(recorded).to.have.length(1);
    });

    it("emits per distinct project root (multi-root)", () => {
        let root = "/ws/a";
        const {deps, recorded} = makeDeps({projectRoot: () => root});
        const reporter = new PythonSetupAdoptionManager(deps);
        reporter.report();
        root = "/ws/b";
        reporter.report();
        expect(recorded).to.have.length(2);
    });

    it("is best-effort: a throwing seam never propagates into the caller", () => {
        const {deps, recorded} = makeDeps({
            venvExists: () => {
                throw new Error("fs blew up");
            },
        });
        const reporter = new PythonSetupAdoptionManager(deps);
        expect(() => reporter.report()).to.not.throw();
        expect(recorded).to.be.empty;
    });
});
