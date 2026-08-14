import {expect} from "chai";
import {
    parsePythonSetupResult,
    isPythonSetupSuccess,
    PythonSetupParseError,
} from "./PythonSetupResult";
import {
    SUCCESS_DEFAULT,
    SUCCESS_CONSTRAINTS_ONLY,
    SUCCESS_REAL_RUN,
    SUCCESS_WITH_WARNINGS,
    ERROR_NO_TARGET,
    ERROR_USAGE,
} from "./fixtures/setupLocalResults";

// The fixtures are typed PythonSetupResult objects; the parser takes raw CLI
// stdout, so serialize a fixture back to JSON to exercise the parse path.
const asStdout = (r: unknown) => JSON.stringify(r);

describe("parsePythonSetupResult", () => {
    it("parses a successful default-mode dry-run result", () => {
        const r = parsePythonSetupResult(asStdout(SUCCESS_DEFAULT));
        expect(r.ok).to.equal(true);
        expect(r.command).to.equal("environments setup-local");
        expect(r.schemaVersion).to.equal(1);
        expect(r.mode).to.equal("default");
        expect(r.dryRun).to.equal(true);
        expect(r.compute?.serverlessVersion).to.equal("v4");
        expect(r.compute?.envKey).to.equal("serverless/serverless-v4");
        expect(r.resolved?.pythonVersion).to.equal("3.12");
        expect(r.resolved?.dbconnectVersion).to.equal("17.2.0");
        expect(r.error).to.equal(null);
        expect(r.phases).to.have.length(6);
        expect(r.phases[0]).to.deep.equal({phase: "preflight", status: "ok"});
    });

    it("parses a constraints-only result with dbconnectVersion absent", () => {
        const r = parsePythonSetupResult(asStdout(SUCCESS_CONSTRAINTS_ONLY));
        expect(r.ok).to.equal(true);
        expect(r.mode).to.equal("constraints-only");
        expect(r.resolved?.pythonVersion).to.equal("3.12");
        expect(r.resolved?.dbconnectVersion).to.equal(undefined);
    });

    it("parses a real (non-dry-run) success with venvPath and backupPath", () => {
        const r = parsePythonSetupResult(asStdout(SUCCESS_REAL_RUN));
        expect(r.ok).to.equal(true);
        expect(r.dryRun).to.equal(false);
        expect(r.venvPath).to.equal("/home/user/project/.venv");
        expect(r.backupPath).to.equal("/home/user/project/pyproject.toml.bak");
    });

    it("parses an E_NO_TARGET failure and exposes the error object", () => {
        const r = parsePythonSetupResult(asStdout(ERROR_NO_TARGET));
        expect(r.ok).to.equal(false);
        expect(r.error?.code).to.equal("E_NO_TARGET");
        expect(r.error?.failurePhase).to.equal("resolve");
        expect(r.error?.diskMutated).to.equal(false);
        // Downstream phases are reported "pending" after a failure.
        const provision = r.phases.find((p) => p.phase === "provision");
        expect(provision?.status).to.equal("pending");
    });

    it("parses an E_USAGE preflight failure", () => {
        const r = parsePythonSetupResult(asStdout(ERROR_USAGE));
        expect(r.ok).to.equal(false);
        expect(r.error?.code).to.equal("E_USAGE");
        expect(r.error?.failurePhase).to.equal("preflight");
    });

    it("parses merge warnings, preserving codes and order (incl. repeats)", () => {
        const r = parsePythonSetupResult(asStdout(SUCCESS_WITH_WARNINGS));
        expect(r.ok).to.equal(true);
        expect(r.warnings.map((w) => w.code)).to.deep.equal([
            "W_REQUIRES_PYTHON_OVERRIDDEN",
            "W_DBCONNECT_PIN_OVERRIDDEN",
            "W_DBCONNECT_PIN_DUPLICATED",
            "W_USER_CONSTRAINT_CONFLICT",
            "W_USER_CONSTRAINT_CONFLICT",
        ]);
    });

    it("normalizes a missing `warnings` key to an empty array", () => {
        // An older/variant CLI that omits `warnings` must not read as
        // undefined: the telemetry layer would then mis-record a real merge as
        // "no result produced" instead of a clean merge (warningsCount 0).
        const {warnings, ...withoutWarnings} = SUCCESS_REAL_RUN;
        void warnings;
        const r = parsePythonSetupResult(asStdout(withoutWarnings));
        expect(r.warnings).to.deep.equal([]);
    });

    it("normalizes a null `warnings` value to an empty array", () => {
        const r = parsePythonSetupResult(
            asStdout({...SUCCESS_REAL_RUN, warnings: null})
        );
        expect(r.warnings).to.deep.equal([]);
    });

    it("throws PythonSetupParseError on non-JSON stdout", () => {
        expect(() => parsePythonSetupResult("not json {")).to.throw(
            PythonSetupParseError
        );
    });

    it("throws PythonSetupParseError when the object lacks `ok`", () => {
        expect(() => parsePythonSetupResult('{"mode":"default"}')).to.throw(
            PythonSetupParseError
        );
    });

    it("throws PythonSetupParseError on empty stdout", () => {
        expect(() => parsePythonSetupResult("")).to.throw(
            PythonSetupParseError
        );
    });
});

describe("isPythonSetupSuccess", () => {
    it("is true for an ok result", () => {
        expect(
            isPythonSetupSuccess(
                parsePythonSetupResult(asStdout(SUCCESS_DEFAULT))
            )
        ).to.equal(true);
    });

    it("is false for a failed result", () => {
        expect(
            isPythonSetupSuccess(
                parsePythonSetupResult(asStdout(ERROR_NO_TARGET))
            )
        ).to.equal(false);
    });
});
