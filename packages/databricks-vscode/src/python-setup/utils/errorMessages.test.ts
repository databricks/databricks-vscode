import {expect} from "chai";
import {
    formatSetupFailureDetail,
    getPythonSetupErrorAction,
    getPythonSetupErrorActions,
    getPythonSetupErrorMessage,
    INSTALL_UV_COMMAND_ID,
    isIndexUnreachableFailure,
    USE_MANUAL_SETUP_COMMAND_ID,
} from "./errorMessages";
import {
    PythonSetupResult,
    PythonSetupErrorCode,
} from "../models/PythonSetupResult";
import {
    ERROR_NO_TARGET,
    ERROR_USAGE,
} from "../models/fixtures/setupLocalResults";

/**
 * A uv "package index unreachable" error message, mirroring the real CLI text a
 * locked-down corporate machine produces when pypi.org is blocked (see the
 * `os error 61` / connection-refused signature).
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
            {compute: {source: "cluster", envKey: "dbr/15.4.x-scala2.12"}}
        );
        const msg = getPythonSetupErrorMessage(r);
        expect(msg).to.contain("dbr/15.4.x-scala2.12");
        expect(msg).to.match(/lts|latest/i);
    });

    it("maps E_ENV_UNSUPPORTED without a compute gracefully", () => {
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

    it("maps a blocked-index E_PROVISION to proxy guidance, not a conflict message", () => {
        const msg = getPythonSetupErrorMessage(
            failure("E_PROVISION", {message: INDEX_UNREACHABLE_CLI_MSG})
        );
        expect(msg).to.match(/package index|pypi\.org/i);
        expect(msg).to.match(/UV_INDEX_URL|pip\.conf|proxy/i);
        // Must NOT claim a dependency conflict, which would misdirect the user.
        expect(msg).to.not.match(/conflict|version conflict/i);
    });

    it("does NOT give index/proxy guidance for an E_PYTHON_INSTALL download failure", () => {
        // uv fetches a managed CPython build from a different mirror
        // (UV_PYTHON_INSTALL_MIRROR), which UV_INDEX_URL / pip index-url cannot
        // fix — so this keeps the plain Python-install message.
        const msg = getPythonSetupErrorMessage(
            failure("E_PYTHON_INSTALL", {
                message:
                    "error: Failed to download `cpython-3.12.8`\n" +
                    "  Caused by: tcp connect error: Connection refused (os error 61)",
            })
        );
        expect(msg).to.not.match(/UV_INDEX_URL|pip\.conf|package index/i);
        expect(msg).to.match(/python version/i);
    });

    it("keeps the dependency-conflict message when E_PROVISION is a real conflict", () => {
        // A resolution conflict has no connectivity symptom, so it must not be
        // mistaken for a blocked index.
        const msg = getPythonSetupErrorMessage(
            failure("E_PROVISION", {
                message:
                    "error: No solution found when resolving dependencies: " +
                    "x==1 depends on y<2, but the runtime requires y==2",
            })
        );
        expect(msg).to.match(/resolve|dependenc/i);
        expect(msg).to.not.match(/UV_INDEX_URL|pip\.conf/i);
    });

    it("maps E_FETCH to an offline/unreachable message", () => {
        expect(getPythonSetupErrorMessage(failure("E_FETCH"))).to.match(
            /reach|offline|network/i
        );
    });

    it("E_FETCH names the GitHub Raw host and the manual-mode escape hatch", () => {
        // The regression from issue #2149: a network that blocks GitHub Raw
        // dead-ends here, so the message must name the host to allowlist and the
        // setting that skips automated setup entirely.
        const msg = getPythonSetupErrorMessage(
            failure("E_FETCH", {failurePhase: "fetch"})
        );
        expect(msg).to.contain("raw.githubusercontent.com");
        expect(msg).to.contain("databricks.python.environmentSetup");
        expect(msg).to.match(/manual/i);
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

describe("getPythonSetupErrorAction", () => {
    it("offers an Installation guide link pointing at the uv docs for E_UV_MISSING", () => {
        // The singular action is the manual fallback (and the log mirror); the
        // one-click installer button is added by getPythonSetupErrorActions.
        const action = getPythonSetupErrorAction(
            failure("E_UV_MISSING", {failurePhase: "preflight"})
        );
        expect(action).to.deep.equal({
            label: "Installation guide",
            url: "https://docs.astral.sh/uv/getting-started/installation/",
        });
    });

    it("offers a Configure package index action for a blocked index", () => {
        const action = getPythonSetupErrorAction(
            failure("E_PROVISION", {message: INDEX_UNREACHABLE_CLI_MSG})
        );
        expect(action).to.deep.equal({
            label: "Configure package index",
            url: "https://docs.astral.sh/uv/configuration/indexes/",
        });
    });

    it("points an ordinary E_PROVISION conflict at the uv resolution docs", () => {
        // A genuine dependency conflict (no connectivity symptom) is distinct from
        // a blocked index: it links to uv's resolution guide, not the index docs.
        expect(getPythonSetupErrorAction(failure("E_PROVISION"))).to.deep.equal(
            {
                label: "Resolve dependency conflicts",
                url: "https://docs.astral.sh/uv/concepts/resolution/",
            }
        );
    });

    it("points E_MANAGER_UNSUPPORTED at the uv projects docs", () => {
        expect(
            getPythonSetupErrorAction(
                failure("E_MANAGER_UNSUPPORTED", {failurePhase: "preflight"})
            )
        ).to.deep.equal({
            label: "Set up a uv project",
            url: "https://docs.astral.sh/uv/concepts/projects/",
        });
    });

    it("asks for manual interpreter selection after Python download fails", () => {
        expect(
            getPythonSetupErrorAction(failure("E_PYTHON_INSTALL"))
        ).to.deep.equal({
            label: "Select Python interpreter",
            command: "databricks.environment.selectPythonInterpreter",
        });
    });

    it("asks for manual selection when provisioning fails after installed fallback", () => {
        expect(
            getPythonSetupErrorAction(
                failure(
                    "E_PROVISION",
                    {},
                    {
                        pythonResolution: "installed_fallback",
                    }
                )
            )
        ).to.deep.equal({
            label: "Select Python interpreter",
            command: "databricks.environment.selectPythonInterpreter",
        });
    });

    it("points E_NO_TARGET at the compute-selection section of the configure docs", () => {
        expect(
            getPythonSetupErrorAction(
                failure("E_NO_TARGET", {failurePhase: "resolve"})
            )
        ).to.deep.equal({
            label: "Configure compute",
            url: "https://docs.databricks.com/aws/en/dev-tools/vscode-ext/configure#cluster",
        });
    });

    it("points E_RESOLVE at the compute-selection section of the configure docs", () => {
        expect(
            getPythonSetupErrorAction(
                failure("E_RESOLVE", {failurePhase: "resolve"})
            )
        ).to.deep.equal({
            label: "Configure compute",
            url: "https://docs.databricks.com/aws/en/dev-tools/vscode-ext/configure#cluster",
        });
    });

    it("points E_ENV_UNSUPPORTED at the Databricks runtime release notes", () => {
        expect(
            getPythonSetupErrorAction(
                failure("E_ENV_UNSUPPORTED", {failurePhase: "fetch"})
            )
        ).to.deep.equal({
            label: "Databricks Runtime versions",
            url: "https://docs.databricks.com/aws/en/release-notes/runtime/",
        });
    });

    it("offers a one-click 'Use manual setup' command action for E_FETCH", () => {
        // The blocked-GitHub case: rather than a doc link, the button runs the
        // command that flips the setting to manual for the project.
        expect(
            getPythonSetupErrorAction(
                failure("E_FETCH", {failurePhase: "fetch"})
            )
        ).to.deep.equal({
            label: "Use manual setup",
            command: USE_MANUAL_SETUP_COMMAND_ID,
        });
    });

    it("offers no action for codes with no clear remediation doc", () => {
        for (const code of [
            "E_USAGE",
            "E_NOT_WRITABLE",
            "E_WRITE",
            "E_MERGE",
            "E_VALIDATE",
        ] as const) {
            expect(getPythonSetupErrorAction(failure(code)), code).to.equal(
                undefined
            );
        }
    });

    it("offers no action when the result carries no error", () => {
        const ok = failure("E_UV_MISSING");
        ok.error = null;
        expect(getPythonSetupErrorAction(ok)).to.equal(undefined);
    });
});

describe("getPythonSetupErrorActions", () => {
    it("leads E_UV_MISSING with a one-click installer, then the manual guide", () => {
        const actions = getPythonSetupErrorActions(
            failure("E_UV_MISSING", {failurePhase: "preflight"})
        );
        expect(actions).to.deep.equal([
            {label: "Install uv", command: INSTALL_UV_COMMAND_ID},
            {
                label: "Installation guide",
                url: "https://docs.astral.sh/uv/getting-started/installation/",
            },
        ]);
    });

    it("wraps Python install recovery in a one-element list", () => {
        expect(
            getPythonSetupErrorActions(failure("E_PYTHON_INSTALL"))
        ).to.deep.equal([
            {
                label: "Select Python interpreter",
                command: "databricks.environment.selectPythonInterpreter",
            },
        ]);
    });

    it("returns an empty list for a code with no actionable button", () => {
        // E_USAGE has no doc link and is not E_UV_MISSING.
        expect(getPythonSetupErrorActions(failure("E_USAGE"))).to.deep.equal(
            []
        );
    });

    it("returns an empty list when the result carries no error", () => {
        const ok = failure("E_UV_MISSING");
        ok.error = null;
        expect(getPythonSetupErrorActions(ok)).to.deep.equal([]);
    });
});

describe("formatSetupFailureDetail", () => {
    it("names the failing phase and error code", () => {
        const detail = formatSetupFailureDetail(
            failure("E_PROVISION", {failurePhase: "provision"})
        );
        expect(detail).to.contain("provision");
        expect(detail).to.contain("E_PROVISION");
    });

    it("includes the raw CLI message (the detail the friendly copy drops)", () => {
        // This is the whole point: the uv conflict text lives in error.message,
        // which the mapped popup copy discards. It must reach the log channel.
        const detail = formatSetupFailureDetail(
            failure("E_PROVISION", {
                message:
                    "x==1 depends on y<2, but the runtime requires y==2 (conflict)",
            })
        );
        expect(detail).to.contain("x==1 depends on y<2");
        expect(detail).to.contain("conflict");
    });

    it("lists the per-phase statuses so the break point is visible", () => {
        const detail = formatSetupFailureDetail(
            failure(
                "E_PROVISION",
                {failurePhase: "provision"},
                {
                    phases: [
                        {phase: "preflight", status: "ok"},
                        {phase: "resolve", status: "ok"},
                        {phase: "provision", status: "error"},
                    ],
                }
            )
        );
        expect(detail).to.contain("preflight");
        expect(detail).to.contain("resolve");
        expect(detail).to.match(/provision.*error/);
    });

    it("returns undefined when the result carries no error (nothing to log)", () => {
        const ok = failure("E_PROVISION");
        ok.error = null;
        expect(formatSetupFailureDetail(ok)).to.equal(undefined);
    });

    it("mirrors the report link into the log when one is provided", () => {
        const detail = formatSetupFailureDetail(failure("E_MERGE"), {
            label: "Report this problem",
            url: "https://github.com/databricks/databricks-vscode/issues/new",
        });
        expect(detail).to.contain(
            "Report this problem: https://github.com/databricks/databricks-vscode/issues/new"
        );
    });

    it("omits the report line when no report link is given", () => {
        const detail = formatSetupFailureDetail(failure("E_MERGE"));
        expect(detail).to.not.contain("Report this problem");
    });

    it("appends copy-pasteable proxy remediation for a blocked index", () => {
        const detail = formatSetupFailureDetail(
            failure("E_PROVISION", {message: INDEX_UNREACHABLE_CLI_MSG})
        );
        // Still carries the raw CLI error …
        expect(detail).to.contain("Connection refused");
        // … plus both remediation paths.
        expect(detail).to.contain("UV_INDEX_URL");
        expect(detail).to.contain("index-url");
        expect(detail).to.contain("extra-index-url");
    });

    it("spells out the allowlist + manual-mode fixes for E_FETCH", () => {
        const detail = formatSetupFailureDetail(
            failure("E_FETCH", {failurePhase: "fetch"})
        );
        expect(detail).to.contain("raw.githubusercontent.com");
        expect(detail).to.contain("allowlist");
        expect(detail).to.contain("databricks.python.environmentSetup");
        expect(detail).to.match(/manual/i);
        // E_FETCH's action is a command (no URL), so the log must not print a
        // "label: undefined" line for it.
        expect(detail).to.not.contain("undefined");
    });

    it("adds no E_FETCH remediation block for another code", () => {
        const detail = formatSetupFailureDetail(failure("E_MERGE"));
        expect(detail).to.not.contain("raw.githubusercontent.com");
        expect(detail).to.not.contain("databricks.python.environmentSetup");
    });

    it("adds no remediation block for a non-connectivity E_PROVISION", () => {
        const detail = formatSetupFailureDetail(
            failure("E_PROVISION", {
                message: "No solution found when resolving dependencies",
            })
        );
        expect(detail).to.not.contain("UV_INDEX_URL");
    });

    it("adds a constraints-report hint for a genuine E_PROVISION conflict", () => {
        const detail = formatSetupFailureDetail(
            failure("E_PROVISION", {
                message: "No solution found when resolving dependencies",
            })
        );
        // A soft, conditional pointer — no button — so a user who believes the
        // published constraints are at fault can report it, without labelling
        // an ordinary (user-owned) dependency conflict as a product defect.
        expect(detail).to.match(/constraint/i);
        expect(detail).to.contain(
            "https://github.com/databricks/environments/issues/new"
        );
    });

    it("adds no constraints-report hint for a blocked-index E_PROVISION", () => {
        // A blocked index is a local network condition, not a constraint defect.
        const detail = formatSetupFailureDetail(
            failure("E_PROVISION", {message: INDEX_UNREACHABLE_CLI_MSG})
        );
        expect(detail).to.not.contain(
            "https://github.com/databricks/environments/issues/new"
        );
    });

    it("adds no constraints-report hint for a non-E_PROVISION failure", () => {
        const detail = formatSetupFailureDetail(failure("E_MERGE"));
        expect(detail).to.not.contain(
            "https://github.com/databricks/environments/issues/new"
        );
    });

    it("appends the documentation link and its label for a code that has one", () => {
        const detail = formatSetupFailureDetail(
            failure("E_NO_TARGET", {failurePhase: "resolve"})
        );
        expect(detail).to.contain(
            "https://docs.databricks.com/aws/en/dev-tools/vscode-ext/configure#cluster"
        );
        expect(detail).to.contain("Configure compute");
    });

    it("appends the uv index docs link for a blocked index", () => {
        const detail = formatSetupFailureDetail(
            failure("E_PROVISION", {message: INDEX_UNREACHABLE_CLI_MSG})
        );
        expect(detail).to.contain(
            "https://docs.astral.sh/uv/configuration/indexes/"
        );
    });

    it("adds no documentation link for a message-only code", () => {
        const detail = formatSetupFailureDetail(failure("E_USAGE"));
        expect(detail).to.not.contain("https://");
    });
});

describe("isIndexUnreachableFailure", () => {
    it("is true for E_PROVISION with a connection-refused message", () => {
        expect(
            isIndexUnreachableFailure(
                failure("E_PROVISION", {message: INDEX_UNREACHABLE_CLI_MSG})
            )
        ).to.equal(true);
    });

    it("is true for a DNS/name-resolution failure fetching the index", () => {
        expect(
            isIndexUnreachableFailure(
                failure("E_PROVISION", {
                    message:
                        "error: Failed to fetch: `https://pypi.org/simple/foo/`\n" +
                        "  Caused by: failed to lookup address information: " +
                        "Temporary failure in name resolution",
                })
            )
        ).to.equal(true);
    });

    it("is true for the macOS getaddrinfo DNS phrasing (failed to lookup address)", () => {
        // macOS wording lacks "name resolution"; the "failed to lookup address"
        // symptom is what catches it.
        expect(
            isIndexUnreachableFailure(
                failure("E_PROVISION", {
                    message:
                        "error: Failed to fetch: `https://pypi.org/simple/foo/`\n" +
                        "  Caused by: failed to lookup address information: " +
                        "nodename nor servname provided, or not known",
                })
            )
        ).to.equal(true);
    });

    it("is false for a genuine dependency conflict (no connectivity symptom)", () => {
        expect(
            isIndexUnreachableFailure(
                failure("E_PROVISION", {
                    message: "No solution found when resolving dependencies",
                })
            )
        ).to.equal(false);
    });

    it("is false for E_PYTHON_INSTALL (a CPython download, not an index fetch)", () => {
        // Scoped to E_PROVISION: the managed-Python download uses a different
        // mirror that the index/proxy guidance cannot fix.
        expect(
            isIndexUnreachableFailure(
                failure("E_PYTHON_INSTALL", {
                    message: INDEX_UNREACHABLE_CLI_MSG,
                })
            )
        ).to.equal(false);
    });

    it("is false for codes outside the provision phase", () => {
        // Even with a connectivity-looking message, E_FETCH (constraints repo)
        // keeps its own mapping — this predicate scopes to E_PROVISION.
        expect(
            isIndexUnreachableFailure(
                failure("E_FETCH", {message: INDEX_UNREACHABLE_CLI_MSG})
            )
        ).to.equal(false);
    });

    it("is true for a git-NAMED package on a blocked index (not a git source)", () => {
        // The failing index URL contains "git" (the package `gitpython`), but it
        // is a /simple/ index fetch — must still be detected. Guards against a
        // naive bare-"git" exclusion.
        expect(
            isIndexUnreachableFailure(
                failure("E_PROVISION", {
                    message:
                        "error: Failed to fetch: `https://pypi.org/simple/gitpython/`\n" +
                        "  Caused by: tcp connect error: Connection refused (os error 61)",
                })
            )
        ).to.equal(true);
    });

    it("is false for a git-dependency source fetch (no /simple index path)", () => {
        // uv prefixes git-clone errors with "failed to fetch" too, but there is no
        // /simple index path — the fix is unrelated to the package index.
        expect(
            isIndexUnreachableFailure(
                failure("E_PROVISION", {
                    message:
                        "error: Failed to fetch git repository " +
                        "`git+https://github.com/acme/pkg`\n" +
                        "  Caused by: tcp connect error: Connection refused",
                })
            )
        ).to.equal(false);
    });

    it("is false for a direct wheel/URL dependency fetch (no /simple index path)", () => {
        // A `pkg @ https://host/pkg.whl` fetch failing to connect is not a package
        // index, so the index/proxy guidance would be wrong.
        expect(
            isIndexUnreachableFailure(
                failure("E_PROVISION", {
                    message:
                        "error: Failed to fetch: `https://host.example/pkg-1.0-py3-none-any.whl`\n" +
                        "  Caused by: tcp connect error: Connection refused",
                })
            )
        ).to.equal(false);
    });

    it("is false when 'simple' only appears in a name, not the /simple/ index path", () => {
        // Guards the trailing slash: a git source or wheel whose path contains
        // "simple" (e.g. simple-salesforce) must not be read as an index fetch.
        expect(
            isIndexUnreachableFailure(
                failure("E_PROVISION", {
                    message:
                        "error: Failed to fetch git repository " +
                        "`git+https://github.com/simple-salesforce/simple-salesforce`\n" +
                        "  Caused by: tcp connect error: Connection refused",
                })
            )
        ).to.equal(false);
    });

    it("is false for a git source even when its path contains /simple/ (org named 'simple')", () => {
        // Structural exclusion: git+ / "git repository" wins over a /simple/ that
        // happens to be a path segment of the git URL.
        expect(
            isIndexUnreachableFailure(
                failure("E_PROVISION", {
                    message:
                        "error: Failed to fetch git repository " +
                        "`git+https://github.com/simple/foo`\n" +
                        "  Caused by: tcp connect error: Connection refused",
                })
            )
        ).to.equal(false);
    });

    it("is false for a direct wheel hosted under a /simple/ path", () => {
        // Structural exclusion: a distribution file (.whl) is not an index listing,
        // even when served from a /simple/ directory.
        expect(
            isIndexUnreachableFailure(
                failure("E_PROVISION", {
                    message:
                        "error: Failed to fetch: `https://host.example/simple/pkg-1.0-py3-none-any.whl`\n" +
                        "  Caused by: tcp connect error: Connection refused",
                })
            )
        ).to.equal(false);
    });

    it("is false for a connectivity symptom without an index-fetch context", () => {
        // A build backend's own stderr ("timed out") with no "failed to fetch"
        // is not a blocked index.
        expect(
            isIndexUnreachableFailure(
                failure("E_PROVISION", {
                    message:
                        "error: Failed to build `foo==1.0`\n" +
                        "  Caused by: the build backend timed out",
                })
            )
        ).to.equal(false);
    });

    it("is false when there is no error object", () => {
        const ok = failure("E_PROVISION");
        ok.error = null;
        expect(isIndexUnreachableFailure(ok)).to.equal(false);
    });
});
