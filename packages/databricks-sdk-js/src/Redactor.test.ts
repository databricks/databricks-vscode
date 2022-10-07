import assert from "assert";
import {defaultRedactor} from ".";
import {onlyNBytes} from "./Redactor";

describe(__filename, () => {
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

    it("should truncate string to n bytes", () => {
        const n = 5;
        const str = "1234567890";
        assert.equal(onlyNBytes(str, n), "12345...(5 more bytes)");
    });
});
