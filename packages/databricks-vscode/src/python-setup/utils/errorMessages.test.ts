import {expect} from "chai";
import {getPythonSetupErrorMessage} from "./errorMessages";
import {
    PythonSetupResult,
    PythonSetupErrorCode,
} from "../models/PythonSetupResult";
import {
    ERROR_NO_TARGET,
    ERROR_USAGE,
} from "../models/fixtures/setupLocalResults";

/** Build a minimal failed result carrying a specific error. */
function failure(
    code: PythonSetupErrorCode,
    extra: Partial<NonNullable<PythonSetupResult["error"]>> = {},
    resultExtra: Partial<PythonSetupResult> = {}
): PythonSetupResult {
    return {
        schemaVersion: 1,
        command: "environments setup-local",
        ok: false,
        mode: "default",
        dryRun: false,
        greenfield: false,
        phases: [],
        warnings: [],
        durationMs: 0,
        error: {
            code,
            failurePhase: "provision",
            message: "raw cli detail",
            diskMutated: false,
            ...extra,
        },
        ...resultExtra,
    };
}

describe("getPythonSetupErrorMessage", () => {
    it("maps E_NO_TARGET to a compute-selection prompt", () => {
        expect(getPythonSetupErrorMessage(failure("E_NO_TARGET"))).to.match(
            /select a cluster or serverless compute/i
        );
    });

    it("maps E_ENV_UNSUPPORTED and includes the env key when present", () => {
        const r = failure(
            "E_ENV_UNSUPPORTED",
            {failurePhase: "fetch"},
            {target: {source: "cluster", envKey: "dbr/15.4.x-scala2.12"}}
        );
        const msg = getPythonSetupErrorMessage(r);
        expect(msg).to.contain("dbr/15.4.x-scala2.12");
        expect(msg).to.match(/lts|latest/i);
    });

    it("maps E_ENV_UNSUPPORTED without a target gracefully", () => {
        const msg = getPythonSetupErrorMessage(failure("E_ENV_UNSUPPORTED"));
        expect(msg).to.match(/no matched environment/i);
        expect(msg).to.not.contain("undefined");
    });

    it("maps E_MANAGER_UNSUPPORTED and mentions uv", () => {
        expect(
            getPythonSetupErrorMessage(failure("E_MANAGER_UNSUPPORTED"))
        ).to.match(/uv/i);
    });

    it("maps E_PROVISION to a dependency-resolution message", () => {
        expect(getPythonSetupErrorMessage(failure("E_PROVISION"))).to.match(
            /resolve|dependenc/i
        );
    });

    it("maps E_FETCH to an offline/unreachable message", () => {
        expect(getPythonSetupErrorMessage(failure("E_FETCH"))).to.match(
            /reach|offline|network/i
        );
    });

    it("maps E_VALIDATE to a mismatch message", () => {
        expect(getPythonSetupErrorMessage(failure("E_VALIDATE"))).to.match(
            /match|mismatch/i
        );
    });

    it("reassures nothing changed when diskMutated is false", () => {
        const msg = getPythonSetupErrorMessage(
            failure("E_FETCH", {diskMutated: false, failurePhase: "fetch"})
        );
        expect(msg).to.match(/no changes were made/i);
    });

    it("mentions the backup file when diskMutated is true and a backup exists", () => {
        const msg = getPythonSetupErrorMessage(
            failure(
                "E_MERGE",
                {diskMutated: true, failurePhase: "merge"},
                {backupPath: "/home/user/project/pyproject.toml.bak"}
            )
        );
        expect(msg).to.contain("pyproject.toml.bak");
    });

    it("uses the actual backup filename from backupPath", () => {
        const msg = getPythonSetupErrorMessage(
            failure(
                "E_MERGE",
                {diskMutated: true, failurePhase: "merge"},
                {backupPath: "/home/user/project/pyproject.toml.20240101.bak"}
            )
        );
        expect(msg).to.contain("pyproject.toml.20240101.bak");
    });

    it("does not claim a .bak backup for a mutated greenfield run", () => {
        // Greenfield writes a brand-new pyproject.toml, so there is no backup.
        const msg = getPythonSetupErrorMessage(
            failure(
                "E_PROVISION",
                {diskMutated: true, failurePhase: "provision"},
                {greenfield: true}
            )
        );
        expect(msg).to.not.contain(".bak");
        expect(msg).to.match(/new pyproject\.toml/i);
    });

    it("prefers the greenfield message even if a backupPath is present", () => {
        // Defensive: greenfield means no prior file existed, so we must never
        // tell the user their original was preserved, regardless of backupPath.
        const msg = getPythonSetupErrorMessage(
            failure(
                "E_PROVISION",
                {diskMutated: true, failurePhase: "provision"},
                {
                    greenfield: true,
                    backupPath: "/home/user/project/pyproject.toml.bak",
                }
            )
        );
        expect(msg).to.match(/new pyproject\.toml/i);
        expect(msg).to.not.contain("preserved");
    });

    it("tolerates a trailing separator in backupPath", () => {
        const msg = getPythonSetupErrorMessage(
            failure(
                "E_MERGE",
                {diskMutated: true, failurePhase: "merge"},
                {backupPath: "/home/user/project/pyproject.toml.bak/"}
            )
        );
        // basename must not leak the full path when it ends in a separator.
        expect(msg).to.contain("pyproject.toml.bak");
        expect(msg).to.not.contain("/home/user");
    });

    it("does not name a .bak backup when disk was mutated but none was recorded", () => {
        const msg = getPythonSetupErrorMessage(
            failure("E_PROVISION", {
                diskMutated: true,
                failurePhase: "provision",
            })
        );
        expect(msg).to.not.contain(".bak");
        expect(msg).to.match(/may have been modified/i);
    });

    it("maps E_USAGE to its bespoke invalid-arguments copy", () => {
        const msg = getPythonSetupErrorMessage(failure("E_USAGE"));
        expect(msg).to.contain("Invalid setup arguments.");
    });

    it("falls back to the generic message for a code absent from the map", () => {
        // Force an out-of-union code to exercise the `?? GENERIC` fallback; the
        // typed union is total, so this branch is otherwise unreachable.
        const unknown = failure(
            "E_SOMETHING_NEW" as unknown as PythonSetupErrorCode
        );
        expect(getPythonSetupErrorMessage(unknown)).to.equal(
            "Python environment setup failed. No changes were made to your project."
        );
    });

    it("returns exactly the generic message when the result has no error object", () => {
        const ok = failure("E_PROVISION");
        ok.error = null;
        // No error => generic copy, and no disk-state suffix at all.
        expect(getPythonSetupErrorMessage(ok)).to.equal(
            "Python environment setup failed."
        );
    });

    it("works on the real CLI golden fixtures", () => {
        const noTarget = getPythonSetupErrorMessage(ERROR_NO_TARGET);
        expect(noTarget).to.match(/select a cluster or serverless compute/i);
        expect(noTarget).to.match(/no changes were made/i);

        const usage = getPythonSetupErrorMessage(ERROR_USAGE);
        expect(usage).to.be.a("string").and.not.be.empty;
    });
});
