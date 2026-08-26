import {expect} from "chai";
import {
    buildExtensionFailureReportAction,
    buildSetupReportUrl,
    getPythonSetupReportAction,
    redactSetupStderr,
    reportNewIssueBaseUrl,
    reportRepoForResult,
    isReportWorthy,
    ReportEnvironment,
} from "./reportSetupIssue";
import {
    PythonSetupResult,
    PythonSetupErrorCode,
} from "../models/PythonSetupResult";

/**
 * A uv "package index unreachable" error message — the same signature the
 * blocked-index detector in errorMessages keys off. Used to prove the
 * network-blocked variant of E_PROVISION is NOT report-worthy.
 */
const INDEX_UNREACHABLE_CLI_MSG =
    "Using CPython 3.12.8\n" +
    "error: Failed to fetch: `https://pypi.org/simple/ipykernel/`\n" +
    "  Caused by: tcp connect error: Connection refused (os error 61)";

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

const ENV: ReportEnvironment = {
    extensionVersion: "2.14.1",
    cliVersion: "1.13.0",
    platform: "darwin",
    packageManager: "uv",
};

describe("reportRepoForResult / isReportWorthy", () => {
    it("routes constraint-content defects to databricks/environments", () => {
        for (const code of [
            "E_ENV_UNSUPPORTED",
            "E_VALIDATE",
        ] as PythonSetupErrorCode[]) {
            expect(reportRepoForResult(failure(code))).to.equal(
                "databricks/environments"
            );
            expect(isReportWorthy(failure(code))).to.equal(true);
        }
    });

    it("routes extension/CLI defects to databricks/databricks-vscode", () => {
        for (const code of ["E_MERGE", "E_WRITE"] as PythonSetupErrorCode[]) {
            expect(reportRepoForResult(failure(code))).to.equal(
                "databricks/databricks-vscode"
            );
        }
    });

    it("does NOT make a genuine E_PROVISION conflict button-report-worthy", () => {
        // A real dependency conflict is usually the user's own declared deps
        // (possibly private packages), not a constraint defect — so it gets no
        // report button; the output-channel hint (in errorMessages) covers the
        // "if you think it's the constraints" case instead.
        const r = failure("E_PROVISION", {
            message:
                "error: No solution found when resolving dependencies: " +
                "x==1 depends on y<2, but the runtime requires y==2",
        });
        expect(reportRepoForResult(r)).to.equal(undefined);
        expect(isReportWorthy(r)).to.equal(false);
    });

    it("does NOT treat a blocked-index E_PROVISION as report-worthy", () => {
        const r = failure("E_PROVISION", {message: INDEX_UNREACHABLE_CLI_MSG});
        expect(reportRepoForResult(r)).to.equal(undefined);
        expect(isReportWorthy(r)).to.equal(false);
    });

    it("does NOT offer a report for preflight/local/network codes", () => {
        for (const code of [
            "E_USAGE",
            "E_MANAGER_UNSUPPORTED",
            "E_NOT_WRITABLE",
            "E_UV_MISSING",
            "E_NO_TARGET",
            "E_RESOLVE",
            "E_FETCH",
            "E_PYTHON_INSTALL",
        ] as PythonSetupErrorCode[]) {
            expect(reportRepoForResult(failure(code))).to.equal(undefined);
        }
    });

    it("is not report-worthy when the result carries no error", () => {
        const ok = failure("E_MERGE");
        ok.error = null;
        expect(isReportWorthy(ok)).to.equal(false);
    });
});

describe("redactSetupStderr", () => {
    it("strips the username from a POSIX home path", () => {
        const out = redactSetupStderr(
            "error at /Users/grigory.panov/proj/pyproject.toml"
        );
        expect(out).to.not.contain("grigory.panov");
        expect(out).to.contain("/Users/");
    });

    it("strips the username from a Linux home path", () => {
        const out = redactSetupStderr("see /home/jdoe/work/app");
        expect(out).to.not.contain("jdoe");
    });

    it("strips the username from a Windows user path", () => {
        const out = redactSetupStderr(
            "C:\\Users\\Jane.Doe\\project\\pyproject.toml"
        );
        expect(out).to.not.contain("Jane.Doe");
        expect(out.toLowerCase()).to.contain("c:\\users\\");
    });

    it("redacts a Databricks PAT and an email address", () => {
        // A `dapi`-prefixed token shape (not a real hex secret) plus an email.
        const fakeToken = "dapi" + "FAKEtestTOKENnotReal000";
        const out = redactSetupStderr(
            `token ${fakeToken} used by alice@example.com`
        );
        expect(out).to.not.contain(fakeToken);
        expect(out).to.not.contain("alice@example.com");
    });

    it("strips a username containing a space from a home path", () => {
        const out = redactSetupStderr(
            "error at /Users/Jane Doe/proj/pyproject.toml"
        );
        expect(out).to.not.contain("Jane Doe");
        expect(out).to.not.contain("Doe");
        expect(out).to.contain("/proj/pyproject.toml");
    });

    it("strips a Windows username containing a space", () => {
        const out = redactSetupStderr(
            "C:\\Users\\Jane Doe\\project\\pyproject.toml"
        );
        expect(out).to.not.contain("Jane Doe");
        expect(out).to.not.contain("Doe");
        expect(out).to.contain("\\project\\pyproject.toml");
    });

    it("strips credentials embedded in a URL", () => {
        const out = redactSetupStderr(
            "failed to fetch https://alice:s3cr3tPAT@pkgs.corp.example/simple/"
        );
        expect(out).to.not.contain("s3cr3tPAT");
        expect(out).to.not.contain("alice:s3cr3tPAT");
    });

    it("redacts a GitHub token, an AWS access key id, and a JWT", () => {
        const ghToken = "ghp_" + "abcdEFGH1234abcdEFGH1234abcdEFGH1234";
        const awsKey = "AKIA" + "IOSFODNN7EXAMPLE0";
        // Assembled at runtime so no contiguous JWT literal sits in the source
        // (it exercises the three-segment redaction regex all the same).
        const jwt = [
            "eyJ" + "hbGciOiJIUzI1NiJ9",
            "eyJ" + "zdWIiOiIxMjM0NTY3ODkwIn0",
            "abc-DEF_123",
        ].join(".");
        const out = redactSetupStderr(`gh=${ghToken} aws=${awsKey} jwt=${jwt}`);
        expect(out).to.not.contain(ghToken);
        expect(out).to.not.contain(awsKey);
        expect(out).to.not.contain(jwt);
    });

    it("redacts secret values passed as URL query parameters", () => {
        const out = redactSetupStderr(
            "fetch https://pkgs.corp/simple/?token=SECRETVAL&sig=AZURESAS123"
        );
        expect(out).to.not.contain("SECRETVAL");
        expect(out).to.not.contain("AZURESAS123");
    });

    it("redacts a bearer token containing non-word characters", () => {
        const out = redactSetupStderr(
            "Authorization: Bearer abc.def/ghi+jkl=mno end"
        );
        expect(out).to.not.contain("abc.def/ghi+jkl=mno");
        expect(out).to.not.contain("ghi+jkl=mno");
        expect(out).to.contain("Bearer");
    });

    it("keeps benign uv output (package names and versions) intact", () => {
        const msg = "error: no solution: numpy==1.26.4 conflicts with pandas";
        expect(redactSetupStderr(msg)).to.contain("numpy==1.26.4");
    });

    it("truncates to the length budget and marks the cut", () => {
        const out = redactSetupStderr("x".repeat(10000), 1500);
        expect(out.length).to.be.lessThan(1600);
        expect(out).to.match(/truncat/i);
    });
});

describe("buildSetupReportUrl", () => {
    it("targets the repo's new-issue page", () => {
        const url = buildSetupReportUrl({
            repo: "databricks/environments",
            env: ENV,
        });
        expect(url).to.contain(
            "https://github.com/databricks/environments/issues/new"
        );
    });

    it("URL-encodes the title and body (no raw spaces or newlines)", () => {
        const url = buildSetupReportUrl({
            repo: "databricks/databricks-vscode",
            errorCode: "E_MERGE",
            failurePhase: "merge",
            env: ENV,
            redactedStderr: "line one\nline two",
        });
        const query = url.split("?")[1];
        expect(query).to.not.match(/[ \n]/);
    });

    it("puts the diagnostic fields into the decoded body", () => {
        const url = buildSetupReportUrl({
            repo: "databricks/environments",
            errorCode: "E_ENV_UNSUPPORTED",
            failurePhase: "resolve",
            envKey: "dbr/15.4.x-scala2.12",
            env: ENV,
        });
        const body = decodeURIComponent(url.split("body=")[1]);
        expect(body).to.contain("E_ENV_UNSUPPORTED");
        expect(body).to.contain("resolve");
        expect(body).to.contain("dbr/15.4.x-scala2.12");
        expect(body).to.contain("2.14.1");
        expect(body).to.contain("1.13.0");
        expect(body).to.contain("darwin");
    });
});

describe("getPythonSetupReportAction", () => {
    it('returns a "Report this problem" action for a report-worthy failure', () => {
        const action = getPythonSetupReportAction(
            failure("E_ENV_UNSUPPORTED", {failurePhase: "resolve"}),
            ENV
        );
        expect(action?.label).to.equal("Report this problem");
        expect(action?.url).to.contain("databricks/environments/issues/new");
    });

    it("returns undefined for a non-report-worthy failure", () => {
        expect(
            getPythonSetupReportAction(failure("E_UV_MISSING"), ENV)
        ).to.equal(undefined);
    });

    it("keeps the prefilled URL bounded even for enormous CLI stderr", () => {
        const action = getPythonSetupReportAction(
            failure("E_VALIDATE", {message: "boom\n" + "y".repeat(50000)}),
            ENV
        );
        expect(action).to.not.equal(undefined);
        expect(action!.url.length).to.be.lessThan(8000);
    });

    it("does not leak PII from stderr into the prefilled body", () => {
        const action = getPythonSetupReportAction(
            failure("E_VALIDATE", {
                message: "failed at /Users/grigory.panov/proj",
            }),
            ENV
        );
        const body = decodeURIComponent(action!.url.split("body=")[1]);
        expect(body).to.not.contain("grigory.panov");
    });
});

describe("buildExtensionFailureReportAction", () => {
    it("always routes to databricks/databricks-vscode with a redacted message", () => {
        const action = buildExtensionFailureReportAction(ENV, {
            phase: "adopt",
            message: "adoption failed for /Users/jdoe/app",
        });
        expect(action.label).to.equal("Report this problem");
        expect(action.url).to.contain(
            "databricks/databricks-vscode/issues/new"
        );
        const body = decodeURIComponent(action.url.split("body=")[1]);
        expect(body).to.contain("adopt");
        expect(body).to.not.contain("jdoe");
    });
});

describe("reportNewIssueBaseUrl", () => {
    it("builds the bare new-issue URL for the log mirror", () => {
        expect(reportNewIssueBaseUrl("databricks/environments")).to.equal(
            "https://github.com/databricks/environments/issues/new"
        );
    });
});
