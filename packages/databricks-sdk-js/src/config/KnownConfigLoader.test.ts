import {parse} from "ini";
import assert from "node:assert";
import {flattenIniObject} from "./KnownConfigLoader";

describe(__filename, () => {
    it("should handle profiles with a dot in the name", () => {
        const config = flattenIniObject(
            parse(`[foo.bar]
host = https://foo.bar

[.foo]
host = https://foo

[bar]
host = https://bar`)
        );

        assert.equal(config["foo.bar"].host, "https://foo.bar");
        assert.equal(config[".foo"].host, "https://foo");
        assert.equal(config["bar"].host, "https://bar");
    });
});
