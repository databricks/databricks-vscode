import {expect} from "chai";
import {
    isTransientFileLockError,
    retryOnTransientError,
    specFileRetriesForPlatform,
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
});
