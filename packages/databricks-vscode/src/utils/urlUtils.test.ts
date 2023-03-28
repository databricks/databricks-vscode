import assert from "assert";
import {
    addHttpsIfNoProtocol,
    isAwsHost,
    isAzureHost,
    isGcpHost,
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

    it("should reject invalid Databricks urls", () => {
        const invalidHosts = [
            "https://google.com/",
            "https://adb-123456789012345.2.azure.com/",
        ];
        invalidHosts.forEach((host) => {
            assert.throws(() => {
                normalizeHost(host);
            });
        });
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
});
