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
    ERROR_NO_TARGET,
} from "../models/fixtures/setupLocalResults";
import {SetupLocalInvocation} from "../utils/setupLocalArgs";

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
        // Default seams model a connected serverless session that opted in.
        isVisible: async () => true,
        resolveCompute: async () => ({kind: "serverless", version: "5"}),
        adoptInterpreter: async () => {},
        saveState: () => {},
        notify: async () => {},
        showError: async () => {},
        showSuccess: async () => {},
        // Mirror the production wrapper: hand the task a log sink and a
        // (never-cancelled) progress token.
        withProgress: async (_title, task) => task(() => {}, makeToken()),
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
                envKey: SUCCESS_REAL_RUN.target!.envKey,
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
                resolveCompute: async () => undefined,
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
        // ok:true with a venvPath but no target/resolved: we could adopt an
        // interpreter, but drift detection would have no baseline to persist —
        // so this is treated as a failure rather than a hollow "ready".
        const withoutBaseline: PythonSetupResult = {
            ...SUCCESS_REAL_RUN,
            target: undefined,
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
