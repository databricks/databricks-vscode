import assert from "assert";
import {
    addHttpsIfNoProtocol,
    isAwsHost,
    isAzureHost,
    isGcpHost,
    isSpogHost,
    normalizeHost,
} from "./urlUtils";

describe(__filename, () => {
    it("should add https if the url does not have it", () => {
        assert(
            addHttpsIfNoProtocol("www.example.com"),
            "https://www.example.com"
        );
    });

    it("should not add https if url has it", () => {
        assert(
            addHttpsIfNoProtocol("https://www.example.com"),
            "https://www.example.com"
        );
    });

    it("should accept valid Databricks urls", () => {
        const validHosts = [
            "https://adb-123456789012345.2.azuredatabricks.net/",
            "https://adb-123456789012345.2.staging.azuredatabricks.net/",
            "https://dbc-123456789012345.cloud.databricks.com/",
            "https://dbc-123456789012345.gcp.databricks.com/",
            "https://adb-1234567890123456.3.databricks.azure.cn",
            "https://adb-123456789012345.3.databricks.azure.us",
        ];
        validHosts.forEach((host) => {
            assert.doesNotThrow(() => {
                normalizeHost(host);

                // needs to be a known cloud
                const url = new URL(host);
                assert.ok(isAwsHost(url) || isAzureHost(url) || isGcpHost(url));
            });
        });
    });

    it("should preserve the w parameter for SPOG urls", () => {
        const spogUrl = "https://accounts.cloud.databricks.com/?w=abc123";
        const normalized = normalizeHost(spogUrl);
        assert.strictEqual(normalized.searchParams.get("w"), "abc123");
        assert.strictEqual(
            normalized.hostname,
            "accounts.cloud.databricks.com"
        );
    });

    it("should not preserve query params other than w", () => {
        const url =
            "https://dbc-123456789012345.cloud.databricks.com/?o=789&other=foo";
        const normalized = normalizeHost(url);
        assert.strictEqual(normalized.search, "");
    });

    it("should identify SPOG hosts by w parameter", () => {
        const spog = new URL("https://accounts.cloud.databricks.com/?w=abc123");
        const nonSpog = new URL(
            "https://dbc-123456789012345.cloud.databricks.com/"
        );
        assert.ok(isSpogHost(spog));
        assert.ok(!isSpogHost(nonSpog));
    });

    it("should treat two SPOG urls with different w as different hosts", () => {
        const a = normalizeHost("https://accounts.cloud.databricks.com/?w=ws1");
        const b = normalizeHost("https://accounts.cloud.databricks.com/?w=ws2");
        assert.notStrictEqual(a.toString(), b.toString());
    });
});
