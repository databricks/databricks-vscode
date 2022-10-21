import assert from "assert";
import {WithError} from "./types";

describe(__filename, () => {
    it("WithError.fromTry should only have error when fn throws", () => {
        const actual = WithError.fromTry(() => {
            throw new Error();
        });

        assert.equal(actual.value, undefined);
        assert.deepEqual(actual.error, new Error());
    });

    it("WithError.fromTry should only have value when fn passes", () => {
        const actual = WithError.fromTry(() => "value");

        assert.equal(actual.value, "value");
        assert.equal(actual.error, undefined);
    });
});
