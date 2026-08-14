import {expect} from "chai";
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
        isVpexActive: () => true,
        getTargetType: () => "serverless",
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
