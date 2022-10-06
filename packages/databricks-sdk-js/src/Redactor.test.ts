import assert from "assert";
import {defaultRedactor} from ".";

describe(__filename, () => {
    it("should redact exact strings", () => {
        const testObj = {
            prop1: "value1",
            prop2: "value2 to-redact.+$/something",
        };
        defaultRedactor.addPattern("to-redact.+$");
        const actual = defaultRedactor.sanitizedToString(testObj);
        const expected = JSON.stringify({
            prop1: "value1",
            prop2: "value2 ***REDACTED***/something",
        });
        assert.equal(actual, expected);
    });

    it("should redact by patterns", () => {
        const testObj = {
            prop1: "value1",
            prop2: "value2 to-redact/something",
        };
        defaultRedactor.addPattern(new RegExp(/to-redact[^"]+/));
        const actual = defaultRedactor.sanitizedToString(testObj);
        const expected = JSON.stringify({
            prop1: "value1",
            prop2: "value2 ***REDACTED***",
        });
        assert.equal(actual, expected);
    });

    it("should redact by field names", () => {
        const testObj = {
            prop: "value1",
            nested: {
                prop: false,
                prop2: "value",
                headers: {
                    header1: "test",
                    header2: "value",
                },
            },
        };
        defaultRedactor.addFieldName("prop");
        const actual = defaultRedactor.sanitize(testObj, ["headers"]);
        const expected = {
            prop: "***REDACTED***",
            nested: {
                prop: "***REDACTED***",
                prop2: "value",
            },
        };
        assert.deepEqual(actual, expected);
    });
});
