import {expect} from "chai";
import {
    PythonSetupEnvironmentSetup,
    PythonSetupSetupDeps,
} from "./PythonSetupEnvironmentSetup";
import {
    CancellationLike,
    PythonSetupCancelledError,
    RunOptions,
} from "../gateways/PythonSetupCliClient";
import {PythonSetupResult} from "../models/PythonSetupResult";
import {
    SUCCESS_REAL_RUN,
    SUCCESS_REAL_RUN_WITH_WARNINGS,
    ERROR_NO_TARGET,
    ERROR_USAGE,
} from "../models/fixtures/setupLocalResults";
import {PythonSetupErrorAction} from "../utils/errorMessages";
import {SetupLocalInvocation} from "../utils/setupLocalArgs";
import {
    PythonSetupAttempt,
    PythonSetupOutcomeReport,
} from "../../telemetry/pythonSetupExtensions";
import {
    DetectionSignal,
    PackageManager,
    PrimaryManager,
} from "../../language/packageManagerDetection";

/** A detection result for the `getDetection` seam. */
function detection(
    primary: PrimaryManager,
    managers: PackageManager[],
    signals: DetectionSignal[] = []
) {
    return {primary, managers, signals};
}

/**
 * Records the attempt/result telemetry the orchestrator emits. Stands in for
 * `Telemetry.recordPythonSetupAttempt`, keeping its shape: recording an attempt
 * hands back the reporter for that run's outcome.
 */
function makeTelemetryRecorder() {
    const attempts: PythonSetupAttempt[] = [];
    const results: PythonSetupOutcomeReport[] = [];
    return {
        attempts,
        results,
        recordSetupAttempt: (attempt: PythonSetupAttempt) => {
            attempts.push(attempt);
            return (report: PythonSetupOutcomeReport) => {
                results.push(report);
            };
        },
        recordNoCompute: () => {
            results.push({outcome: "no_compute"});
        },
    };
}

/**
 * A never-cancelled {@link CancellationLike} that can be flipped via `cancel()`,
 * firing its listeners — the shape the real `window.withProgress` token has.
 */
function makeToken(): CancellationLike & {cancel(): void} {
    const listeners: Array<() => void> = [];
    let cancelled = false;
    return {
        get isCancellationRequested() {
            return cancelled;
        },
        onCancellationRequested(listener: () => void) {
            listeners.push(listener);
            return {dispose() {}};
        },
        cancel() {
            cancelled = true;
            listeners.forEach((l) => l());
        },
    };
}

/**
 * A recording fake of the one method the orchestrator calls on the CLI client.
 * `run` is scripted to resolve with a fixture (or reject, for cancellation),
 * and it captures the invocation *and* the {@link RunOptions} it was handed so
 * tests can assert the argv the orchestrator built and that `cwd` / `onLog` /
 * `token` are threaded through.
 */
function makeCli(
    outcome: {resolve: PythonSetupResult} | {reject: Error} = {
        resolve: SUCCESS_REAL_RUN,
    }
) {
    const calls: SetupLocalInvocation[] = [];
    const options: RunOptions[] = [];
    return {
        calls,
        options,
        run: async (invocation: SetupLocalInvocation, opts: RunOptions) => {
            calls.push(invocation);
            options.push(opts);
            if ("reject" in outcome) {
                throw outcome.reject;
            }
            return outcome.resolve;
        },
    };
}

function makeDeps(
    overrides: Partial<PythonSetupSetupDeps> = {}
): PythonSetupSetupDeps {
    return {
        cli: makeCli(),
        projectRoot: () => "/proj",
        // Default seams model a uv-suitable project with a connected serverless
        // session.
        isVisible: async () => true,
        resolveCompute: async () => ({
            status: "ok",
            compute: {kind: "serverless", version: "5"},
        }),
        adoptInterpreter: async () => {},
        saveState: () => {},
        notify: async () => {},
        showReauthPrompt: async () => {},
        showError: async () => {},
        showSuccess: async () => {},
        reportEnvironment: {
            extensionVersion: "2.14.1",
            cliVersion: "1.13.0",
            platform: "darwin",
        },
        // Mirror the production wrapper: hand the task a log sink and a
        // (never-cancelled) progress token.
        withProgress: async (_title, task) => task(() => {}, makeToken()),
        // Telemetry defaults to a no-op sink; tests that assert on events pass
        // a recorder instead.
        recordSetupAttempt: () => () => {},
        recordNoCompute: () => {},
        getDetection: async () => detection("uv", ["uv"]),
        hasPyprojectToml: async () => true,
        ...overrides,
    };
}

describe("PythonSetupEnvironmentSetup.setup", () => {
    it("runs the CLI and marks ready on a successful real run", async () => {
        const cli = makeCli({resolve: SUCCESS_REAL_RUN});
        const adopted: Array<{venvPath: string; root: string}> = [];
        const saved: Array<{envKey: string; pythonVersion: string}> = [];
        const succeeded: PythonSetupResult[] = [];
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                cli,
                adoptInterpreter: async (venvPath, root) => {
                    adopted.push({venvPath, root});
                },
                saveState: (s) => {
                    saved.push(s);
                },
                showSuccess: async (r) => {
                    succeeded.push(r);
                },
            })
        );

        await setup.setup();

        expect(setup.ready).to.equal(true);
        expect(cli.calls).to.have.length(1);
        // Serverless version "5" flows into the invocation the client runs.
        expect(cli.calls[0].compute).to.deep.equal({
            kind: "serverless",
            version: "5",
        });
        // cwd (the project root) and an onLog sink are threaded into the run.
        expect(cli.options[0].cwd).to.equal("/proj");
        expect(cli.options[0].onLog).to.be.a("function");
        expect(adopted).to.deep.equal([
            {venvPath: SUCCESS_REAL_RUN.venvPath, root: "/proj"},
        ]);
        expect(saved).to.deep.equal([
            {
                envKey: SUCCESS_REAL_RUN.compute!.envKey,
                pythonVersion: SUCCESS_REAL_RUN.resolved!.pythonVersion,
            },
        ]);
        // The success is announced, with the parsed result.
        expect(succeeded).to.deep.equal([SUCCESS_REAL_RUN]);
    });

    it("adopts for the project captured at start, not the live one (mid-run switch)", async () => {
        // Model the active project switching from A to B while the CLI runs.
        let activeRoot = "/projA";
        const adopted: Array<{venvPath: string; root: string}> = [];
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                projectRoot: () => activeRoot,
                // The user switches the active project mid-run.
                withProgress: async (_title, task) => {
                    const result = await task(() => {}, makeToken());
                    activeRoot = "/projB";
                    return result;
                },
                adoptInterpreter: async (venvPath, root) => {
                    adopted.push({venvPath, root});
                },
            })
        );

        await setup.setup();

        // Adoption targets /projA (the run's cwd), never the switched-to /projB:
        // otherwise B's interpreter setting would point at A's venv.
        expect(adopted).to.deep.equal([
            {venvPath: SUCCESS_REAL_RUN.venvPath, root: "/projA"},
        ]);
    });

    it("reports ready only for the project it was set up for, not another active project", async () => {
        // Set up /projA, then model the active project switching to /projB
        // (never provisioned). readiness must track the run's project, not leak
        // across a project switch — otherwise the config view shows a green
        // "ready" line for a project that has no venv.
        let activeRoot = "/projA";
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({projectRoot: () => activeRoot})
        );

        await setup.setup();
        // Still on /projA (the project just provisioned): ready.
        expect(setup.ready).to.equal(true);

        // Switch the active project to one that was never set up.
        activeRoot = "/projB";
        expect(setup.ready).to.equal(false);

        // Switch back: /projA's readiness is remembered, not discarded.
        activeRoot = "/projA";
        expect(setup.ready).to.equal(true);
    });

    it("does nothing when there is no open project", async () => {
        const cli = makeCli();
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({cli, projectRoot: () => undefined})
        );

        await setup.setup();

        expect(cli.calls).to.have.length(0);
        expect(setup.ready).to.equal(false);
    });

    it("does not run the CLI when the gate is closed", async () => {
        const cli = makeCli();
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({cli, isVisible: async () => false})
        );

        await setup.setup();

        expect(cli.calls).to.have.length(0);
        expect(setup.ready).to.equal(false);
    });

    it("guides the user (without running the CLI) when no compute could be resolved", async () => {
        const cli = makeCli();
        const notified: string[] = [];
        const shownErrors: string[] = [];
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                cli,
                resolveCompute: async () => ({status: "none"}),
                notify: async (m) => {
                    notified.push(m);
                },
                showError: async (m) => {
                    shownErrors.push(m);
                },
            })
        );

        await setup.setup();

        // No project mutation, but the visible CTA must not be a dead button:
        // tell the user to attach compute rather than silently no-op'ing.
        expect(cli.calls).to.have.length(0);
        expect(setup.ready).to.equal(false);
        // Pre-flight guidance goes through notify (plain toast), not showError
        // (which would reveal an empty output channel — no CLI ran).
        expect(notified).to.have.length(1);
        expect(notified[0]).to.contain(
            "Select a cluster or serverless compute"
        );
        expect(shownErrors).to.have.length(0);
    });

    it("surfaces a mapped error message on CLI failure and stays not-ready", async () => {
        const shownErrors: string[] = [];
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                cli: makeCli({resolve: ERROR_NO_TARGET}),
                showError: async (m) => {
                    shownErrors.push(m);
                },
            })
        );

        await setup.setup();

        expect(setup.ready).to.equal(false);
        expect(shownErrors).to.have.length(1);
        // The mapped, user-facing copy for E_NO_TARGET (not the raw CLI text).
        expect(shownErrors[0]).to.contain(
            "Select a cluster or serverless compute"
        );
    });

    it("passes the CLI's raw failure detail to the log, not just the popup copy", async () => {
        const shown: {message: string; detail?: string}[] = [];
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                cli: makeCli({resolve: ERROR_NO_TARGET}),
                showError: async (message, detail) => {
                    shown.push({message, detail});
                },
            })
        );

        await setup.setup();

        expect(shown).to.have.length(1);
        // The popup stays the concise mapped copy (no raw CLI flag noise)...
        expect(shown[0].message).to.not.contain("--serverless-version");
        // ...while the detail carries the CLI's own explanation plus the
        // phase/code, so the "Show Logs" button leads somewhere useful.
        expect(shown[0].detail).to.contain("No compute target is selected");
        expect(shown[0].detail).to.contain("E_NO_TARGET");
    });

    it("offers an Install uv action when the CLI reports uv is missing", async () => {
        const shown: {
            message: string;
            action?: PythonSetupErrorAction;
        }[] = [];
        const uvMissing: PythonSetupResult = {
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
                code: "E_UV_MISSING",
                failurePhase: "preflight",
                message: "uv not found on PATH",
                diskMutated: false,
            },
        };
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                cli: makeCli({resolve: uvMissing}),
                showError: async (message, _detail, action) => {
                    shown.push({message, action});
                },
            })
        );

        await setup.setup();

        expect(shown).to.have.length(1);
        expect(shown[0].action).to.deep.equal({
            label: "Install uv",
            url: "https://docs.astral.sh/uv/getting-started/installation/",
        });
    });

    it("offers the mapped documentation action for a doc-linked failure", async () => {
        const shown: {action?: PythonSetupErrorAction}[] = [];
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                cli: makeCli({resolve: ERROR_NO_TARGET}),
                showError: async (_message, _detail, action) => {
                    shown.push({action});
                },
            })
        );

        await setup.setup();

        expect(shown).to.have.length(1);
        expect(shown[0].action).to.deep.equal({
            label: "Configure compute",
            url: "https://docs.databricks.com/aws/en/dev-tools/vscode-ext/configure#cluster",
        });
    });

    it("passes no remediation action for a message-only failure", async () => {
        // E_USAGE has no doc that reliably helps, so it surfaces the message alone.
        const shown: {action?: PythonSetupErrorAction}[] = [];
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                cli: makeCli({resolve: ERROR_USAGE}),
                showError: async (_message, _detail, action) => {
                    shown.push({action});
                },
            })
        );

        await setup.setup();

        expect(shown).to.have.length(1);
        expect(shown[0].action).to.equal(undefined);
    });

    it("makes Report this problem the button for a report-worthy CLI failure", async () => {
        const shown: {detail?: string; action?: PythonSetupErrorAction}[] = [];
        const telemetry = makeTelemetryRecorder();
        const mergeFailure: PythonSetupResult = {
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
                code: "E_MERGE",
                failurePhase: "merge",
                message: "merge blew up",
                diskMutated: true,
            },
        };
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                cli: makeCli({resolve: mergeFailure}),
                recordSetupAttempt: telemetry.recordSetupAttempt,
                showError: async (_m, detail, action) => {
                    shown.push({detail, action});
                },
            })
        );

        await setup.setup();

        expect(shown[0].action?.label).to.equal("Report this problem");
        expect(shown[0].action?.url).to.contain(
            "databricks/databricks-vscode/issues/new"
        );
        // The bare new-issue URL is mirrored into the log too.
        expect(shown[0].detail).to.contain(
            "Report this problem: https://github.com/databricks/databricks-vscode/issues/new"
        );
        expect(telemetry.results[0].reportOffered).to.equal(true);
    });

    it("keeps Report as the button while mirroring the doc link into the log", async () => {
        // E_ENV_UNSUPPORTED is report-worthy AND has a doc link: report wins the
        // button; the doc link still appears in the log.
        const shown: {detail?: string; action?: PythonSetupErrorAction}[] = [];
        const envUnsupported: PythonSetupResult = {
            schemaVersion: 1,
            command: "environments setup-local",
            ok: false,
            mode: "default",
            dryRun: false,
            greenfield: false,
            phases: [],
            warnings: [],
            durationMs: 0,
            compute: {source: "cluster", envKey: "dbr/15.4.x-scala2.12"},
            error: {
                code: "E_ENV_UNSUPPORTED",
                failurePhase: "resolve",
                message: "no published environment",
                diskMutated: false,
            },
        };
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                cli: makeCli({resolve: envUnsupported}),
                showError: async (_m, detail, action) => {
                    shown.push({detail, action});
                },
            })
        );

        await setup.setup();

        expect(shown[0].action?.label).to.equal("Report this problem");
        expect(shown[0].action?.url).to.contain(
            "databricks/environments/issues/new"
        );
        expect(shown[0].detail).to.contain("Databricks Runtime versions");
        expect(shown[0].detail).to.contain(
            "Report this problem: https://github.com/databricks/environments/issues/new"
        );
    });

    it("records reportOffered=false for a non-report-worthy CLI failure", async () => {
        const telemetry = makeTelemetryRecorder();
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                cli: makeCli({resolve: ERROR_NO_TARGET}),
                recordSetupAttempt: telemetry.recordSetupAttempt,
            })
        );

        await setup.setup();

        expect(telemetry.results[0].reportOffered).to.equal(false);
    });

    it("surfaces the raw error message when the CLI run rejects", async () => {
        const shownErrors: string[] = [];
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                // A spawn/parse rejection (not a cancellation): no result to map.
                cli: makeCli({reject: new Error("spawn databricks ENOENT")}),
                showError: async (m) => {
                    shownErrors.push(m);
                },
            })
        );

        await setup.setup();

        expect(setup.ready).to.equal(false);
        expect(shownErrors).to.deep.equal(["spawn databricks ENOENT"]);
    });

    it("offers a Report this problem action on a spawn/parse rejection", async () => {
        const shown: {action?: PythonSetupErrorAction}[] = [];
        const telemetry = makeTelemetryRecorder();
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                cli: makeCli({reject: new Error("spawn databricks ENOENT")}),
                recordSetupAttempt: telemetry.recordSetupAttempt,
                showError: async (_m, _detail, action) => {
                    shown.push({action});
                },
            })
        );

        await setup.setup();

        expect(shown[0].action?.label).to.equal("Report this problem");
        expect(shown[0].action?.url).to.contain(
            "databricks/databricks-vscode/issues/new"
        );
        expect(telemetry.results[0]).to.include({
            outcome: "not_started",
            reportOffered: true,
        });
    });

    it("prompts re-login (no report) when the CLI aborts telling the user to re-authenticate", async () => {
        const shownErrors: {
            message: string;
            action?: PythonSetupErrorAction;
        }[] = [];
        let reauthPrompts = 0;
        const telemetry = makeTelemetryRecorder();
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                // A no-result abort whose stderr carries the reauth signal.
                cli: makeCli({
                    reject: new Error(
                        "CLI did not return valid JSON: Unexpected end of JSON input\n" +
                            "Error: the refresh token is invalid. To reauthenticate, " +
                            "run: databricks auth login --profile dev"
                    ),
                }),
                recordSetupAttempt: telemetry.recordSetupAttempt,
                showReauthPrompt: async () => {
                    reauthPrompts++;
                },
                showError: async (message, _detail, action) => {
                    shownErrors.push({message, action});
                },
            })
        );

        await setup.setup();

        expect(setup.ready).to.equal(false);
        // The re-login prompt replaces the hard error + report action entirely.
        expect(reauthPrompts).to.equal(1);
        expect(shownErrors).to.have.length(0);
        expect(telemetry.results[0]).to.include({
            outcome: "not_started",
            reportOffered: false,
        });
    });

    it("reports a spawn/parse defect (not re-login) when the abort has no reauth signal", async () => {
        const shown: {action?: PythonSetupErrorAction}[] = [];
        let reauthPrompts = 0;
        const telemetry = makeTelemetryRecorder();
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                // A no-result abort with no auth signal (e.g. offline / crash):
                // it must stay on the report path, not be mislabeled as expiry.
                cli: makeCli({reject: new Error("spawn databricks ENOENT")}),
                recordSetupAttempt: telemetry.recordSetupAttempt,
                showReauthPrompt: async () => {
                    reauthPrompts++;
                },
                showError: async (_m, _detail, action) => {
                    shown.push({action});
                },
            })
        );

        await setup.setup();

        expect(reauthPrompts).to.equal(0);
        expect(shown[0].action?.label).to.equal("Report this problem");
        expect(telemetry.results[0]).to.include({
            outcome: "not_started",
            reportOffered: true,
        });
    });

    it("handles a non-Error rejection without throwing on the spawn path", async () => {
        const shown: {message: string; action?: PythonSetupErrorAction}[] = [];
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                // A rejection that is not an Error instance: `.message` would be
                // undefined, and the redactor must not throw on it.
                cli: {
                    run: async () => {
                        throw "spawn failed as a bare string";
                    },
                },
                showError: async (message, _detail, action) => {
                    shown.push({message, action});
                },
            })
        );

        // Must resolve, not reject — the original failure has to reach the user.
        await setup.setup();

        expect(shown).to.have.length(1);
        expect(shown[0].message).to.contain("spawn failed as a bare string");
        expect(shown[0].action?.label).to.equal("Report this problem");
    });

    it("offers a Report this problem action when interpreter adoption fails", async () => {
        const shown: {action?: PythonSetupErrorAction}[] = [];
        const telemetry = makeTelemetryRecorder();
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                cli: makeCli({resolve: SUCCESS_REAL_RUN}),
                adoptInterpreter: async () => {
                    throw new Error("adopt failed");
                },
                recordSetupAttempt: telemetry.recordSetupAttempt,
                showError: async (_m, _detail, action) => {
                    shown.push({action});
                },
            })
        );

        await setup.setup();

        expect(shown[0].action?.label).to.equal("Report this problem");
        expect(shown[0].action?.url).to.contain(
            "databricks/databricks-vscode/issues/new"
        );
        expect(telemetry.results[0]).to.include({
            outcome: "failed",
            failurePhase: "adopt",
            reportOffered: true,
        });
    });

    it("treats a success without a venv path as a failure", async () => {
        const shownErrors: string[] = [];
        const adopted: string[] = [];
        const saved: PythonSetupResult[] = [];
        const succeeded: PythonSetupResult[] = [];
        // An ok:true result that carries no venvPath (e.g. a dry-run shape or
        // CLI/schema drift): there is no interpreter to adopt.
        const withoutVenv: PythonSetupResult = {
            ...SUCCESS_REAL_RUN,
            venvPath: undefined,
        };
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                cli: makeCli({resolve: withoutVenv}),
                adoptInterpreter: async (p) => {
                    adopted.push(p);
                },
                saveState: () => {
                    saved.push(withoutVenv);
                },
                showSuccess: async (r) => {
                    succeeded.push(r);
                },
                showError: async (m) => {
                    shownErrors.push(m);
                },
            })
        );

        await setup.setup();

        expect(setup.ready).to.equal(false);
        expect(adopted).to.have.length(0);
        // Neither the drift baseline nor the success announcement fire.
        expect(saved).to.have.length(0);
        expect(succeeded).to.have.length(0);
        // The generic fallback copy (the result's `error` is null on an ok run).
        expect(shownErrors).to.deep.equal(["Python environment setup failed."]);
    });

    it("treats a success missing target/resolved as a failure", async () => {
        const shownErrors: string[] = [];
        const adopted: string[] = [];
        const saved: unknown[] = [];
        // ok:true with a venvPath but no compute/resolved: we could adopt an
        // interpreter, but drift detection would have no baseline to persist —
        // so this is treated as a failure rather than a hollow "ready".
        const withoutBaseline: PythonSetupResult = {
            ...SUCCESS_REAL_RUN,
            compute: undefined,
            resolved: undefined,
        };
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                cli: makeCli({resolve: withoutBaseline}),
                adoptInterpreter: async (p) => {
                    adopted.push(p);
                },
                saveState: (s) => {
                    saved.push(s);
                },
                showError: async (m) => {
                    shownErrors.push(m);
                },
            })
        );

        await setup.setup();

        expect(setup.ready).to.equal(false);
        // No interpreter is adopted and no baseline is persisted.
        expect(adopted).to.have.length(0);
        expect(saved).to.have.length(0);
        expect(shownErrors).to.have.length(1);
    });

    it("stays not-ready and shows no error when the run is cancelled", async () => {
        const shownErrors: string[] = [];
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                cli: makeCli({reject: new PythonSetupCancelledError()}),
                showError: async (m) => {
                    shownErrors.push(m);
                },
            })
        );

        await setup.setup();

        expect(setup.ready).to.equal(false);
        // Cancellation is a user action, not a failure — no error toast.
        expect(shownErrors).to.have.length(0);
    });

    it("threads the progress cancellation token through to cli.run", async () => {
        const shownErrors: string[] = [];
        const token = makeToken();
        // A client that honours the token the way the real one does: reject with
        // PythonSetupCancelledError once cancellation has been requested.
        const cli = {
            calls: [] as SetupLocalInvocation[],
            options: [] as RunOptions[],
            run: async (invocation: SetupLocalInvocation, opts: RunOptions) => {
                cli.calls.push(invocation);
                cli.options.push(opts);
                if (opts.token?.isCancellationRequested) {
                    throw new PythonSetupCancelledError();
                }
                return SUCCESS_REAL_RUN;
            },
        };
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                cli,
                showError: async (m) => {
                    shownErrors.push(m);
                },
                // Model a user who clicked "Cancel" on the progress notification
                // before the CLI got going.
                withProgress: async (_title, task) => {
                    token.cancel();
                    return task(() => {}, token);
                },
            })
        );

        await setup.setup();

        // The same token the progress indicator owns reached the client...
        expect(cli.options[0].token).to.equal(token);
        // ...and a token-driven cancellation is silent, exactly like a rejection.
        expect(setup.ready).to.equal(false);
        expect(shownErrors).to.have.length(0);
    });

    it("fires onDidChangeState when it becomes ready", async () => {
        let fired = 0;
        const setup = new PythonSetupEnvironmentSetup(makeDeps());
        setup.onDidChangeState(() => {
            fired += 1;
        });

        await setup.setup();

        expect(fired).to.equal(1);
    });

    it("coalesces overlapping setup() calls onto a single CLI run", async () => {
        let release: (r: PythonSetupResult) => void = () => {};
        const gate = new Promise<PythonSetupResult>((res) => {
            release = res;
        });
        const cli = {
            calls: [] as SetupLocalInvocation[],
            run: (invocation: SetupLocalInvocation) => {
                cli.calls.push(invocation);
                return gate;
            },
        };
        const setup = new PythonSetupEnvironmentSetup(makeDeps({cli}));

        // Two overlapping invocations while the first run is still in-flight.
        const first = setup.setup();
        const second = setup.setup();
        release(SUCCESS_REAL_RUN);
        await Promise.all([first, second]);

        // Only one project-mutating CLI process was started.
        expect(cli.calls).to.have.length(1);

        // Once the in-flight run settles, a later call starts a fresh run.
        await setup.setup();
        expect(cli.calls).to.have.length(2);
    });

    it("clears the in-flight guard even when a run rejects", async () => {
        const cli = makeCli({resolve: SUCCESS_REAL_RUN});
        // isVisible runs outside runSetup()'s try/catch, so a throw here rejects
        // runSetup — the path that must still clear `inFlight` (via the finally)
        // so a later call is not deadlocked.
        let failNext = true;
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                cli,
                isVisible: async () => {
                    if (failNext) {
                        failNext = false;
                        throw new Error("gate blew up");
                    }
                    return true;
                },
            })
        );

        let rejected = false;
        try {
            await setup.setup();
        } catch {
            rejected = true;
        }
        expect(rejected).to.equal(true);
        expect(cli.calls).to.have.length(0);

        // The guard was cleared despite the rejection: a fresh run proceeds.
        await setup.setup();
        expect(cli.calls).to.have.length(1);
        expect(setup.ready).to.equal(true);
    });

    it("clears the guard after the work even if the notification stays open", async () => {
        // Model a user who leaves the success toast up (never dismisses it):
        // showSuccess never resolves. The re-entrancy guard must release when the
        // mutating work (CLI run + adopt + state) finishes, NOT when the toast is
        // dismissed -- otherwise the entry stays wedged (every later click returns
        // the still-pending promise) until the window is reloaded.
        const cli = makeCli({resolve: SUCCESS_REAL_RUN});
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                cli,
                showSuccess: () => new Promise<void>(() => {}),
            })
        );

        // Resolves once the work is done, despite the still-open notification.
        await setup.setup();
        expect(cli.calls).to.have.length(1);

        // A later click starts a fresh run rather than returning the wedged one.
        await setup.setup();
        expect(cli.calls).to.have.length(2);
    });

    it("surfaces an error and stays not-ready when interpreter adoption fails", async () => {
        const shownErrors: string[] = [];
        const saved: unknown[] = [];
        const succeeded: PythonSetupResult[] = [];
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                cli: makeCli({resolve: SUCCESS_REAL_RUN}),
                adoptInterpreter: async () => {
                    throw new Error("could not select interpreter");
                },
                saveState: (s) => {
                    saved.push(s);
                },
                showSuccess: async (r) => {
                    succeeded.push(r);
                },
                showError: async (m) => {
                    shownErrors.push(m);
                },
            })
        );

        await setup.setup();

        // A provisioned-but-unadopted env is a failure: show the error, and do
        // not persist state, flip ready, or announce success.
        expect(setup.ready).to.equal(false);
        expect(shownErrors).to.deep.equal(["could not select interpreter"]);
        expect(saved).to.have.length(0);
        expect(succeeded).to.have.length(0);
    });
});

describe("PythonSetupEnvironmentSetup telemetry", () => {
    it("records an attempt and an ok result on a successful run", async () => {
        const telemetry = makeTelemetryRecorder();
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                ...telemetry,
                getDetection: async () => detection("uv", ["uv"]),
            })
        );

        await setup.setup();

        expect(telemetry.attempts).to.deep.equal([
            {
                packageManager: "uv",
                targetType: "serverless",
                serverlessVersion: "5",
                mode: "default",
                // hasPyprojectToml defaults to true, so this is not greenfield.
                isGreenfield: false,
                // First run for the project: not yet ready.
                trigger: "initial",
            },
        ]);
        expect(telemetry.results).to.deep.equal([
            {
                outcome: "ok",
                envKey: SUCCESS_REAL_RUN.compute!.envKey,
                warnings: SUCCESS_REAL_RUN.warnings,
            },
        ]);
    });

    it("threads the CLI's merge warnings into the ok result", async () => {
        const telemetry = makeTelemetryRecorder();
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                ...telemetry,
                cli: makeCli({resolve: SUCCESS_REAL_RUN_WITH_WARNINGS}),
            })
        );

        await setup.setup();

        // The report carries the CLI's warnings verbatim; the count and the
        // categorical histogram are derived in the telemetry layer, not here.
        expect(telemetry.results).to.deep.equal([
            {
                outcome: "ok",
                envKey: SUCCESS_REAL_RUN_WITH_WARNINGS.compute!.envKey,
                warnings: SUCCESS_REAL_RUN_WITH_WARNINGS.warnings,
            },
        ]);
    });

    it("labels a run over an already-ready project as a rerun", async () => {
        const telemetry = makeTelemetryRecorder();
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                ...telemetry,
                getDetection: async () => detection("uv", ["uv"]),
            })
        );

        // First run provisions the env and marks the project ready.
        await setup.setup();
        expect(setup.ready).to.equal(true);
        // Second run over the same (now ready) project is a re-run.
        await setup.setup();

        expect(telemetry.attempts.map((a) => a.trigger)).to.deep.equal([
            "initial",
            "rerun",
        ]);
    });

    it("omits serverlessVersion and reports cluster for a cluster target", async () => {
        const telemetry = makeTelemetryRecorder();
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                ...telemetry,
                resolveCompute: async () => ({
                    status: "ok",
                    compute: {kind: "cluster", clusterId: "0710-abc"},
                }),
            })
        );

        await setup.setup();

        expect(telemetry.attempts).to.have.length(1);
        expect(telemetry.attempts[0].targetType).to.equal("cluster");
        // Never emit a cluster id: the attempt carries only the target *kind*.
        expect(telemetry.attempts[0].serverlessVersion).to.equal(undefined);
        expect(JSON.stringify(telemetry.attempts[0])).to.not.contain("0710");
    });

    it("reports isGreenfield when the project has no pyproject.toml", async () => {
        const telemetry = makeTelemetryRecorder();
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                ...telemetry,
                getDetection: async () => detection("unknown", []),
                hasPyprojectToml: async () => false,
            })
        );

        await setup.setup();

        expect(telemetry.attempts[0].isGreenfield).to.equal(true);
    });

    it("omits isGreenfield for a real pip project (the signal is unreliable there)", async () => {
        const telemetry = makeTelemetryRecorder();
        let probed = 0;
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                ...telemetry,
                // pip/conda users may never have a pyproject.toml, so its
                // absence says nothing about greenfield-ness.
                getDetection: async () =>
                    detection("pip", ["pip"], ["requirements.txt"]),
                hasPyprojectToml: async () => {
                    probed += 1;
                    return false;
                },
            })
        );

        await setup.setup();

        expect(telemetry.attempts[0].packageManager).to.equal("pip");
        expect(telemetry.attempts[0].isGreenfield).to.equal(undefined);
        // Not even probed: the answer could not be reported either way.
        expect(probed).to.equal(0);
    });

    // The population reported on is the one the gate admits, not the one whose
    // `primary` is uv/unknown. A packaging-shaped pyproject.toml (what `bundle
    // init` generates) is attributed to pip yet is a project we set up, so the
    // flag must still be reported for it -- keying off `primary` would blank the
    // field for exactly the cohort worth measuring.
    it("reports isGreenfield when pip was attributed only by the pyproject's shape", async () => {
        const telemetry = makeTelemetryRecorder();
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                ...telemetry,
                getDetection: async () =>
                    detection("pip", ["pip"], ["pyproject.pipOnly"]),
                hasPyprojectToml: async () => true,
            })
        );

        await setup.setup();

        expect(telemetry.attempts[0].packageManager).to.equal("pip");
        // Has a pyproject.toml, so not greenfield -- but reported, not omitted.
        expect(telemetry.attempts[0].isGreenfield).to.equal(false);
    });

    // An unavailable detection (no project root) must not silently drop the
    // signal: it degrades to "no manager fired", which the visibility gate also
    // reads as suitable, so both sides agree on the failure path.
    it("still reports isGreenfield when detection is unavailable", async () => {
        const telemetry = makeTelemetryRecorder();
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                ...telemetry,
                getDetection: async () => undefined,
                hasPyprojectToml: async () => false,
            })
        );

        await setup.setup();

        expect(telemetry.attempts[0].packageManager).to.equal("unknown");
        expect(telemetry.attempts[0].isGreenfield).to.equal(true);
    });

    it("reports the failure phase, error code and disk state on CLI failure", async () => {
        const telemetry = makeTelemetryRecorder();
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({...telemetry, cli: makeCli({resolve: ERROR_NO_TARGET})})
        );

        await setup.setup();

        expect(telemetry.attempts).to.have.length(1);
        expect(telemetry.results).to.deep.equal([
            {
                outcome: "failed",
                failurePhase: ERROR_NO_TARGET.error!.failurePhase,
                errorCode: ERROR_NO_TARGET.error!.code,
                envKey: ERROR_NO_TARGET.compute?.envKey,
                diskMutated: ERROR_NO_TARGET.error!.diskMutated,
                // E_NO_TARGET is not one of the package-fetching phases.
                indexUnreachable: false,
                // E_NO_TARGET is a preflight/local code, never report-worthy.
                reportOffered: false,
                warnings: ERROR_NO_TARGET.warnings,
            },
        ]);
    });

    it("flags indexUnreachable when uv cannot reach the package index", async () => {
        const telemetry = makeTelemetryRecorder();
        // A provision failure whose message is uv's connection-refused signature
        // (blocked pypi.org needing a proxy), not a dependency conflict.
        const blockedIndex: PythonSetupResult = {
            ...ERROR_NO_TARGET,
            phases: [
                {phase: "preflight", status: "ok"},
                {phase: "resolve", status: "ok"},
                {phase: "fetch", status: "ok"},
                {phase: "merge", status: "ok"},
                {phase: "provision", status: "error"},
                {phase: "validate", status: "pending"},
            ],
            error: {
                code: "E_PROVISION",
                failurePhase: "provision",
                message:
                    "error: Failed to fetch: `https://pypi.org/simple/ipykernel/`\n" +
                    "  Caused by: tcp connect error: Connection refused (os error 61)",
                diskMutated: false,
            },
        };
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({...telemetry, cli: makeCli({resolve: blockedIndex})})
        );

        await setup.setup();

        expect(telemetry.results[0].indexUnreachable).to.equal(true);
    });

    it('reports the synthetic "adopt" phase when interpreter adoption fails', async () => {
        const telemetry = makeTelemetryRecorder();
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                ...telemetry,
                adoptInterpreter: async () => {
                    throw new Error("could not select interpreter");
                },
            })
        );

        await setup.setup();

        // The CLI exited ok, so there is no CLI error code — but the flow
        // failed, at the extension's own phase.
        expect(telemetry.results).to.deep.equal([
            {
                outcome: "failed",
                failurePhase: "adopt",
                envKey: SUCCESS_REAL_RUN.compute!.envKey,
                // An adopt failure is the extension's own defect → report offered.
                reportOffered: true,
                warnings: SUCCESS_REAL_RUN.warnings,
            },
        ]);
    });

    it("reports cancelled when the user aborts the run", async () => {
        const telemetry = makeTelemetryRecorder();
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                ...telemetry,
                cli: makeCli({reject: new PythonSetupCancelledError()}),
            })
        );

        await setup.setup();

        // Distinct from `failed`: the user gave up, nothing broke.
        expect(telemetry.results).to.deep.equal([{outcome: "cancelled"}]);
    });

    it("reports not_started when the CLI produces no result", async () => {
        const telemetry = makeTelemetryRecorder();
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                ...telemetry,
                cli: makeCli({reject: new Error("spawn databricks ENOENT")}),
            })
        );

        await setup.setup();

        // A spawn/parse error has no result object, so there is no phase or
        // error code to attribute the break to. It is the extension/CLI's own
        // defect, so a report against databricks-vscode is offered.
        expect(telemetry.results).to.deep.equal([
            {outcome: "not_started", reportOffered: true},
        ]);
    });

    it("records nothing when there is no project or the gate is closed", async () => {
        for (const overrides of [
            {projectRoot: () => undefined},
            {isVisible: async () => false},
        ]) {
            const telemetry = makeTelemetryRecorder();
            const setup = new PythonSetupEnvironmentSetup(
                makeDeps({...telemetry, ...overrides})
            );

            await setup.setup();

            // Neither is a user-visible dead end: with no project there is
            // nothing to set up, and a closed gate means the CTA was never shown.
            expect(telemetry.attempts).to.have.length(0);
            expect(telemetry.results).to.have.length(0);
        }
    });

    it("reports no_compute (without an attempt) when the CTA is a dead end", async () => {
        const telemetry = makeTelemetryRecorder();
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                ...telemetry,
                resolveCompute: async () => ({status: "none"}),
            })
        );

        await setup.setup();

        // The entry is visible whenever the project fits, independent of
        // compute, so this is a real dead-end click worth measuring. No run
        // started, hence no attempt to pair with.
        expect(telemetry.attempts).to.have.length(0);
        expect(telemetry.results).to.deep.equal([{outcome: "no_compute"}]);
    });

    it("stops silently when the user dismisses the version prompt", async () => {
        const cli = makeCli();
        const telemetry = makeTelemetryRecorder();
        const notified: string[] = [];
        const shownErrors: string[] = [];
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                ...telemetry,
                cli,
                resolveCompute: async () => ({status: "cancelled"}),
                notify: async (m) => {
                    notified.push(m);
                },
                showError: async (m) => {
                    shownErrors.push(m);
                },
            })
        );

        await setup.setup();

        // A dismissal is a user action, not a failure and not a dead end: no
        // run, no toast of either kind, and nothing recorded — reporting
        // no_compute here would conflate deliberate bail-outs with a CTA that
        // had nothing to do.
        expect(cli.calls).to.have.length(0);
        expect(notified).to.have.length(0);
        expect(shownErrors).to.have.length(0);
        expect(telemetry.attempts).to.have.length(0);
        expect(telemetry.results).to.have.length(0);
        expect(setup.ready).to.equal(false);
    });

    it("still guides the user when the no_compute emit throws", async () => {
        const notified: string[] = [];
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                resolveCompute: async () => ({status: "none"}),
                recordNoCompute: () => {
                    throw new Error("telemetry blew up");
                },
                notify: async (m) => {
                    notified.push(m);
                },
            })
        );

        await setup.setup();

        expect(notified).to.have.length(1);
    });

    it("records exactly one result per attempt, including across runs", async () => {
        const telemetry = makeTelemetryRecorder();
        const setup = new PythonSetupEnvironmentSetup(makeDeps(telemetry));

        // Two coalesced calls (one run), then a second, separate run.
        await Promise.all([setup.setup(), setup.setup()]);
        await setup.setup();

        expect(telemetry.attempts).to.have.length(2);
        expect(telemetry.results).to.have.length(2);
    });

    it("does not report ok when the post-adoption state bookkeeping throws", async () => {
        const telemetry = makeTelemetryRecorder();
        const shown: {action?: PythonSetupErrorAction}[] = [];
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                ...telemetry,
                saveState: () => {
                    throw new Error("workspaceState write failed");
                },
                showError: async (_m, _detail, action) => {
                    shown.push({action});
                },
            })
        );

        let rejected = false;
        try {
            await setup.setup();
        } catch {
            rejected = true;
        }

        // The run rejected, so recording success would permanently overstate the
        // success rate.
        expect(rejected).to.equal(true);
        // The user is still told the run failed and offered a report — a persist
        // break is the extension's own defect, like adopt.
        expect(shown[0].action?.label).to.equal("Report this problem");
        expect(shown[0].action?.url).to.contain(
            "databricks/databricks-vscode/issues/new"
        );
        expect(telemetry.results).to.deep.equal([
            {
                outcome: "failed",
                failurePhase: "persist",
                envKey: SUCCESS_REAL_RUN.compute!.envKey,
                reportOffered: true,
                warnings: SUCCESS_REAL_RUN.warnings,
            },
        ]);
    });

    it("reports ok before showSuccess, so user think-time is not in the duration", async () => {
        const telemetry = makeTelemetryRecorder();
        let reportedBeforeToast = false;
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                ...telemetry,
                // showSuccess wraps window.showInformationMessage, whose promise
                // settles only once the user dismisses the toast.
                showSuccess: async () => {
                    reportedBeforeToast = telemetry.results.length === 1;
                },
            })
        );

        await setup.setup();

        expect(reportedBeforeToast).to.equal(true);
        expect(telemetry.results[0].outcome).to.equal("ok");
    });

    it("completes the setup even when the telemetry emit itself throws", async () => {
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                recordSetupAttempt: () => {
                    throw new Error("telemetry blew up");
                },
            })
        );

        await setup.setup();

        // Measurement must never break the flow it measures.
        expect(setup.ready).to.equal(true);
    });

    it("completes the setup even when the result reporter throws", async () => {
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                recordSetupAttempt: () => () => {
                    throw new Error("reporter blew up");
                },
            })
        );

        await setup.setup();

        expect(setup.ready).to.equal(true);
    });

    it("keeps the detected manager when only the pyproject probe fails", async () => {
        const telemetry = makeTelemetryRecorder();
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                ...telemetry,
                getDetection: async () => detection("uv", ["uv"]),
                hasPyprojectToml: async () => {
                    throw new Error("stat failed");
                },
            })
        );

        await setup.setup();

        // The two probes are independent: a failing greenfield probe must not
        // discard a successfully detected manager, or the manager distribution
        // would skew toward `unknown`.
        expect(telemetry.attempts[0].packageManager).to.equal("uv");
        expect(telemetry.attempts[0].isGreenfield).to.equal(undefined);
    });

    it("still records the attempt when gathering its context fails", async () => {
        const telemetry = makeTelemetryRecorder();
        const setup = new PythonSetupEnvironmentSetup(
            makeDeps({
                ...telemetry,
                getDetection: async () => {
                    throw new Error("detection blew up");
                },
            })
        );

        await setup.setup();

        // Telemetry must never cost the user their setup run: the attempt
        // degrades to `unknown` rather than propagating.
        expect(setup.ready).to.equal(true);
        expect(telemetry.attempts).to.have.length(1);
        expect(telemetry.attempts[0].packageManager).to.equal("unknown");
        // The greenfield probe is independent and still runs: a failed detection
        // degrades to "no manager fired", which is suitable (the gate reads it
        // the same way), and this project has a pyproject.toml.
        expect(telemetry.attempts[0].isGreenfield).to.equal(false);
        expect(telemetry.results).to.deep.equal([
            {
                outcome: "ok",
                envKey: SUCCESS_REAL_RUN.compute!.envKey,
                warnings: SUCCESS_REAL_RUN.warnings,
            },
        ]);
    });
});
