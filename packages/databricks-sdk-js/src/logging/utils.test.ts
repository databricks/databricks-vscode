import assert from "assert";
import "..";
import {onlyNBytes} from "./utils";

describe(__filename, () => {
    it("should truncate string to n bytes", () => {
        const n = 5;
        const str = "1234567890";
        assert.equal(onlyNBytes(str, n), "12345...(5 more bytes)");
    });
});
