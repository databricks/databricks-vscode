import retry, {RetriableError} from "./retries";
import Time, {TimeUnits} from "./Time";
import chai, {assert, expect} from "chai";
import spies from "chai-spies";
import chaiAsPromised from "chai-as-promised";

chai.use(chaiAsPromised);
chai.use(spies);
class NonRetriableError extends Error {}

describe(__filename, function () {
    this.timeout(new Time(10, TimeUnits.minutes).toMillSeconds().value);

    it("should return result if timeout doesn't expire", async function () {
        const startTime = Date.now();

        const retryResult = await retry({
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

        assert.equal(retryResult, "returned_string");
    });

    it("should return retriable error if timeout expires", async function () {
        const startTime = Date.now();
        await expect(
            retry({
                timeout: new Time(5, TimeUnits.seconds),
                fn: () => {
                    if (Date.now() - startTime < 10000) {
                        throw new RetriableError();
                    }
                    return new Promise<string>((resolve) =>
                        resolve("returned_string")
                    );
                },
            })
        ).to.be.rejectedWith(RetriableError);
    });

    it("should throw non retriable error immediately", async function () {
        const mockFunction = chai.spy();

        await expect(
            retry({
                timeout: new Time(5, TimeUnits.seconds),
                fn: () => {
                    mockFunction();
                    throw new NonRetriableError();
                },
            })
        ).to.be.rejectedWith(NonRetriableError);

        expect(mockFunction).to.be.called.once;
    });
});
