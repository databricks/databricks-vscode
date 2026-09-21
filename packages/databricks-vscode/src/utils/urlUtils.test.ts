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

    it("should strip query params from host", () => {
        const url =
            "https://dbc-123456789012345.cloud.databricks.com/?o=789&other=foo";
        const normalized = normalizeHost(url);
        assert.strictEqual(normalized.search, "");
    });

    it("should identify SPOG hosts by *.databricks.com hostname", () => {
        assert.ok(isSpogHost(new URL("https://db-deco-test.databricks.com")));
        assert.ok(isSpogHost(new URL("https://demo-spog.databricks.com")));
    });

    it("should not classify standard cloud hosts as SPOG", () => {
        assert.ok(
            !isSpogHost(
                new URL("https://dbc-123456789012345.cloud.databricks.com")
            )
        );
        assert.ok(
            !isSpogHost(
                new URL("https://dbc-123456789012345.gcp.databricks.com")
            )
        );
        assert.ok(
            !isSpogHost(
                new URL("https://dbc-123456789012345.dev.databricks.com")
            )
        );
    });
});
