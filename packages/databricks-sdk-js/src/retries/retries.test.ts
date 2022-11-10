import retry, {RetriableError, TimeoutError} from "./retries";
import Time, {TimeUnits} from "./Time";
import * as sinon from "sinon";
import * as assert from "node:assert";

class NonRetriableError extends Error {}

describe(__filename, function () {
    let fakeTimer: sinon.SinonFakeTimers;

    beforeEach(() => {
        fakeTimer = sinon.useFakeTimers();
    });

    afterEach(() => {
        fakeTimer.restore();
    });

    this.timeout(1000 * 3);
    it("should return result if timeout doesn't expire", async function () {
        const startTime = Date.now();

        const retryResult = retry({
            timeout: new Time(5, TimeUnits.seconds),
            fn: () => {
                if (Date.now() - startTime < 1000) {
                    throw new RetriableError();
                }
                return new Promise<string>((resolve) =>
                    resolve("returned_string")
                );
            },
        });

        fakeTimer.tick(800);
        fakeTimer.tick(800);
        fakeTimer.tick(800);

        assert.equal(await retryResult, "returned_string");
    });

    it("should return retriable error if timeout expires", async function () {
        const startTime = Date.now();

        const retryResult = retry({
            timeout: new Time(5, TimeUnits.seconds),
            fn: () => {
                if (Date.now() - startTime < 10000) {
                    throw new RetriableError();
                }
                return new Promise<string>((resolve) =>
                    resolve("returned_string")
                );
            },
        });

        fakeTimer.tick(800);
        fakeTimer.tick(800);
        fakeTimer.tick(2000);
        fakeTimer.tick(5000);

        try {
            await retryResult;
            assert.fail("should throw TimeoutError");
        } catch (err) {
            assert.ok(err instanceof TimeoutError);
        }
    });

    it("should throw non retriable error immediately", async function () {
        let callCount = 0;

        try {
            await retry({
                timeout: new Time(5, TimeUnits.seconds),
                fn: () => {
                    callCount += 1;
                    throw new NonRetriableError();
                },
            });
            assert.fail("should throw NonRetriableError");
        } catch (err) {
            assert.ok(err instanceof NonRetriableError);
        }

        assert.equal(callCount, 1);
    });
});
