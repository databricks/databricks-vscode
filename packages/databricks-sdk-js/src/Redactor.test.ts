import assert from "assert";
import {defaultRedactor} from ".";

describe(__filename, () => {
    it("should redact exact strings", () => {
        const testObj = {
            prop1: "value1",
            prop2: "value2 to-redact.+$/something",
        };
        defaultRedactor.addPattern("to-redact.+$");
        const actual = defaultRedactor.redactToString(testObj);
        const expected = JSON.stringify({
            prop1: "value1",
            prop2: "value2 REDACTED/something",
        });
        assert.equal(actual, expected);
    });

    it("should redact by patterns", () => {
        const testObj = {
            prop1: "value1",
            prop2: "value2 to-redact/something",
        };
        defaultRedactor.addPattern(new RegExp(/to-redact[^"]+/));
        const actual = defaultRedactor.redactToString(testObj);
        const expected = JSON.stringify({
            prop1: "value1",
            prop2: "value2 REDACTED",
        });
        assert.equal(actual, expected);
    });
});
