import {expect} from "chai";
import path from "node:path";
import {
    isTransientFileLockError,
    retryOnTransientError,
    specFileRetriesForPlatform,
    specFileRetriesDelayForPlatform,
    shouldPreserveFailedAttemptLogs,
    failedAttemptLogRenames,
    formatRecoveredSpecsReport,
} from "./retry";

// A pip failure Node's execFile surfaces: `.message` is only "Command failed:
// <cmd>", while the diagnostic (the WinError line) lands in `.stderr`. The
// predicate has to look past `.message` or it will miss every real lock.
function pipError(stderr: string): Error {
    return Object.assign(new Error("Command failed: python -m pip install"), {
        stderr,
    });
}

describe("retry", () => {
    describe("isTransientFileLockError", () => {
        it("matches the WinError 32 'used by another process' lock", () => {
            const error = pipError(
                "ERROR: Could not install packages due to an OSError: " +
                    "[WinError 32] The process cannot access the file because " +
                    "it is being used by another process: " +
                    "'...\\.venv\\Lib\\site-packages\\numpy\\_core\\_add_newdocs_scalars.py'"
            );
            expect(isTransientFileLockError(error)).to.equal(true);
        });

        it("does not match a bare WinError 5 'Access is denied' (can be a permanent permission error)", () => {
            const error = pipError(
                "ERROR: Could not install packages due to an OSError: " +
                    "[WinError 5] Access is denied: '...\\numpy\\core.pyd'"
            );
            expect(isTransientFileLockError(error)).to.equal(false);
        });

        it("does not match a longer error code that merely starts with 32", () => {
            const error = pipError(
                "ERROR: Could not install packages due to an OSError: " +
                    "[WinError 320] something unrelated"
            );
            expect(isTransientFileLockError(error)).to.equal(false);
        });

        it("does not match a non-lock failure (version not found)", () => {
            const error = pipError(
                "ERROR: Could not find a version that satisfies the " +
                    "requirement databricks-connect==17.3.*"
            );
            expect(isTransientFileLockError(error)).to.equal(false);
        });
    });

    describe("retryOnTransientError", () => {
        const alwaysTransient = () => true;
        const neverTransient = () => false;
        const noopSleep = async () => {};

        it("returns the result without sleeping when the operation succeeds", async () => {
            let calls = 0;
            let slept = 0;
            const result = await retryOnTransientError(
                async () => {
                    calls++;
                    return "ok";
                },
                {
                    attempts: 3,
                    delayMs: 5,
                    isTransient: alwaysTransient,
                    sleep: async () => {
                        slept++;
                    },
                }
            );

            expect(result).to.equal("ok");
            expect(calls).to.equal(1);
            expect(slept).to.equal(0);
        });

        it("retries a transient failure until the operation succeeds", async () => {
            let calls = 0;
            const result = await retryOnTransientError(
                async () => {
                    calls++;
                    if (calls < 3) {
                        throw new Error("transient");
                    }
                    return "ok";
                },
                {
                    attempts: 3,
                    delayMs: 5,
                    isTransient: alwaysTransient,
                    sleep: noopSleep,
                }
            );

            expect(result).to.equal("ok");
            expect(calls).to.equal(3);
        });

        it("waits with linear backoff between attempts", async () => {
            const delays: number[] = [];
            let calls = 0;
            await retryOnTransientError(
                async () => {
                    calls++;
                    if (calls < 3) {
                        throw new Error("transient");
                    }
                    return "ok";
                },
                {
                    attempts: 3,
                    delayMs: 5,
                    isTransient: alwaysTransient,
                    sleep: async (ms) => {
                        delays.push(ms);
                    },
                }
            );

            // delayMs * attempt-number: 5 before the 2nd try, 10 before the 3rd.
            expect(delays).to.deep.equal([5, 10]);
        });

        it("gives up and rethrows after exhausting attempts on a persistent transient error", async () => {
            let calls = 0;
            let error: unknown;
            try {
                await retryOnTransientError(
                    async () => {
                        calls++;
                        throw new Error("still locked");
                    },
                    {
                        attempts: 3,
                        delayMs: 5,
                        isTransient: alwaysTransient,
                        sleep: noopSleep,
                    }
                );
            } catch (e) {
                error = e;
            }

            expect(calls).to.equal(3);
            expect((error as Error)?.message).to.equal("still locked");
        });

        it("rethrows a non-transient error immediately without retrying", async () => {
            let calls = 0;
            let error: unknown;
            try {
                await retryOnTransientError(
                    async () => {
                        calls++;
                        throw new Error("fatal");
                    },
                    {
                        attempts: 3,
                        delayMs: 5,
                        isTransient: neverTransient,
                        sleep: noopSleep,
                    }
                );
            } catch (e) {
                error = e;
            }

            expect(calls).to.equal(1);
            expect((error as Error)?.message).to.equal("fatal");
        });

        it("reports each retry through the onRetry callback", async () => {
            const seen: Array<{attempt: number; message: string}> = [];
            let calls = 0;
            await retryOnTransientError(
                async () => {
                    calls++;
                    if (calls < 3) {
                        throw new Error(`fail ${calls}`);
                    }
                    return "ok";
                },
                {
                    attempts: 3,
                    delayMs: 5,
                    isTransient: alwaysTransient,
                    sleep: noopSleep,
                    onRetry: (attempt, e) => {
                        seen.push({
                            attempt,
                            message: (e as Error).message,
                        });
                    },
                }
            );

            expect(seen).to.deep.equal([
                {attempt: 1, message: "fail 1"},
                {attempt: 2, message: "fail 2"},
            ]);
        });
    });

    describe("specFileRetriesForPlatform", () => {
        it("retries a whole spec once on Windows", () => {
            expect(specFileRetriesForPlatform("win32")).to.equal(1);
        });

        it("does not retry on Linux", () => {
            expect(specFileRetriesForPlatform("linux")).to.equal(0);
        });

        it("does not retry on macOS", () => {
            expect(specFileRetriesForPlatform("darwin")).to.equal(0);
        });
    });

    describe("specFileRetriesDelayForPlatform", () => {
        it("waits before a retry on Windows", () => {
            expect(specFileRetriesDelayForPlatform("win32")).to.equal(5);
        });

        it("does not wait on Linux or macOS", () => {
            expect(specFileRetriesDelayForPlatform("linux")).to.equal(0);
            expect(specFileRetriesDelayForPlatform("darwin")).to.equal(0);
        });
    });

    describe("shouldPreserveFailedAttemptLogs", () => {
        it("preserves when a failed attempt will be retried", () => {
            expect(shouldPreserveFailedAttemptLogs(1, 1)).to.equal(true);
        });

        it("does not preserve a passing attempt", () => {
            expect(shouldPreserveFailedAttemptLogs(0, 1)).to.equal(false);
        });

        it("does not preserve the final failed attempt (no retries left)", () => {
            expect(shouldPreserveFailedAttemptLogs(1, 0)).to.equal(false);
        });
    });

    describe("failedAttemptLogRenames", () => {
        it("parks the wdio and chromedriver logs for the worker's cid", () => {
            expect(failedAttemptLogRenames("logs", "0-3")).to.deep.equal([
                {
                    from: path.join("logs", "wdio-0-3.log"),
                    to: path.join("logs", "wdio-0-3-failed-attempt.log"),
                },
                {
                    from: path.join("logs", "wdio-0-3-chromedriver.log"),
                    to: path.join(
                        "logs",
                        "wdio-0-3-chromedriver-failed-attempt.log"
                    ),
                },
            ]);
        });
    });

    describe("formatRecoveredSpecsReport", () => {
        it("returns no lines when nothing recovered", () => {
            expect(formatRecoveredSpecsReport([], false)).to.deep.equal([]);
            expect(formatRecoveredSpecsReport([], true)).to.deep.equal([]);
        });

        it("lists recovered specs under a header without CI annotations", () => {
            expect(
                formatRecoveredSpecsReport(["a.e2e.ts", "b.e2e.ts"], false)
            ).to.deep.equal([
                "⚠️  PASSED ONLY ON RETRY (flaky — investigate):",
                "  - a.e2e.ts",
                "  - b.e2e.ts",
            ]);
        });

        it("adds a ::warning:: workflow command per spec under GitHub Actions", () => {
            expect(
                formatRecoveredSpecsReport(["a.e2e.ts"], true)
            ).to.deep.equal([
                "⚠️  PASSED ONLY ON RETRY (flaky — investigate):",
                "  - a.e2e.ts",
                "::warning::PASSED ONLY ON RETRY: a.e2e.ts",
            ]);
        });

        it("shows the basename for an absolute path or file:// URL", () => {
            expect(
                formatRecoveredSpecsReport(
                    [
                        "file:///C:/a/eng-dev-ecosystem/ext/src/test/e2e/bundle_init.e2e.ts",
                        "/home/runner/work/src/test/e2e/auth.e2e.ts",
                    ],
                    false
                )
            ).to.deep.equal([
                "⚠️  PASSED ONLY ON RETRY (flaky — investigate):",
                "  - bundle_init.e2e.ts",
                "  - auth.e2e.ts",
            ]);
        });
    });
});
