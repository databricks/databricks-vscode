import assert from "assert";
import {untilAborted} from "./promiseUtils";

describe(__filename, () => {
    it("settles like the promise when it settles first", async () => {
        const controller = new AbortController();

        assert.equal(
            await untilAborted(Promise.resolve(1), controller.signal),
            1
        );
        await assert.rejects(
            untilAborted(
                Promise.reject(new Error("failed")),
                controller.signal
            ),
            /failed/
        );
        controller.abort(new Error("too late"));
    });

    it("rejects with the signal's reason when aborted first", async () => {
        const controller = new AbortController();
        const pending = untilAborted(new Promise(() => {}), controller.signal);

        controller.abort(new Error("cancelled"));

        await assert.rejects(pending, /cancelled/);
    });

    it("rejects at once when the signal is already aborted", async () => {
        await assert.rejects(
            untilAborted(
                new Promise(() => {}),
                AbortSignal.abort(new Error("already cancelled"))
            ),
            /already cancelled/
        );
    });
});
