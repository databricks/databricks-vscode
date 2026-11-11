import { describe, expect, it } from "vitest";
import {
    hostKey,
    isAwsHost,
    isAzureHost,
    isGcpHost,
    isSpogHost,
    normalizeHost,
    profileCreationMethods,
    sameWorkspace,
    validateDatabricksHost,
    workspaceIdFromHost,
} from "./hostMatching";

describe("normalizeHost", () => {
    // Ported from urlUtils.test.ts.
    it("accepts Databricks hosts of every cloud", () => {
        for (const host of [
            "https://adb-123456789012345.2.azuredatabricks.net/",
            "https://adb-123456789012345.2.staging.azuredatabricks.net/",
            "https://dbc-123456789012345.cloud.databricks.com/",
            "https://dbc-123456789012345.gcp.databricks.com/",
            "https://adb-1234567890123456.3.databricks.azure.cn",
            "https://adb-123456789012345.3.databricks.azure.us",
        ]) {
            const url = normalizeHost(host);
            expect(isAwsHost(url) || isAzureHost(url) || isGcpHost(url)).toBe(true);
        }
    });

    it("strips the query and the path", () => {
        const url = normalizeHost("https://dbc-1.cloud.databricks.com/some/path?o=789&other=foo");
        expect(url.toString()).toBe("https://dbc-1.cloud.databricks.com/");
    });

    it("adds https when the scheme is missing, and refuses http", () => {
        expect(normalizeHost("dbc-1.cloud.databricks.com").toString()).toBe(
            "https://dbc-1.cloud.databricks.com/",
        );
        expect(() => normalizeHost("http://dbc-1.cloud.databricks.com")).toThrow(
            "Invalid protocol",
        );
    });

    it("identifies unified (SPOG) hosts, and not the standard cloud hosts", () => {
        expect(isSpogHost(new URL("https://db-deco-test.databricks.com"))).toBe(true);
        expect(isSpogHost(new URL("https://dbc-1.cloud.databricks.com"))).toBe(false);
        expect(isSpogHost(new URL("https://dbc-1.gcp.databricks.com"))).toBe(false);
        expect(isSpogHost(new URL("https://dbc-1.dev.databricks.com"))).toBe(false);
    });
});

describe("sameWorkspace", () => {
    const cases: [
        string,
        Parameters<typeof sameWorkspace>[0],
        Parameters<typeof sameWorkspace>[1],
        boolean,
    ][] = [
        [
            "identical",
            { host: "https://a.cloud.databricks.com" },
            { host: "https://a.cloud.databricks.com" },
            true,
        ],
        [
            "trailing slash",
            { host: "https://a.cloud.databricks.com/" },
            { host: "https://a.cloud.databricks.com" },
            true,
        ],
        [
            "case",
            { host: "https://A.Cloud.Databricks.com" },
            { host: "https://a.cloud.databricks.com" },
            true,
        ],
        [
            "missing scheme",
            { host: "a.cloud.databricks.com" },
            { host: "https://a.cloud.databricks.com/" },
            true,
        ],
        [
            "different host",
            { host: "https://a.cloud.databricks.com" },
            { host: "https://b.cloud.databricks.com" },
            false,
        ],
        [
            "same workspace ID",
            { host: "https://u.databricks.com", workspaceId: "1" },
            { host: "https://u.databricks.com", workspaceId: "1" },
            true,
        ],
        [
            "different workspace IDs",
            { host: "https://u.databricks.com", workspaceId: "1" },
            { host: "https://u.databricks.com", workspaceId: "2" },
            false,
        ],
        [
            "one workspace ID",
            { host: "https://u.databricks.com", workspaceId: "1" },
            { host: "https://u.databricks.com" },
            true,
        ],
        [
            "workspace ID from ?o=",
            { host: "https://u.databricks.com/?o=2" },
            { host: "https://u.databricks.com", workspaceId: "1" },
            false,
        ],
        ["no host", {}, { host: "https://a.cloud.databricks.com" }, false],
    ];
    for (const [name, a, b, expected] of cases) {
        it(name, () => {
            expect(sameWorkspace(a, b)).toBe(expected);
            expect(sameWorkspace(b, a)).toBe(expected);
        });
    }

    it("reads ?o= and ?w=", () => {
        expect(workspaceIdFromHost("https://u.databricks.com?w=12")).toBe("12");
        expect(workspaceIdFromHost("u.databricks.com/?o=34")).toBe("34");
        expect(workspaceIdFromHost("https://u.databricks.com")).toBeUndefined();
    });

    it("keys hosts without the trailing slash", () => {
        expect(hostKey("https://a.cloud.databricks.com/")).toBe("https://a.cloud.databricks.com");
        expect(hostKey("not a host")).toBeUndefined();
        expect(hostKey(undefined)).toBeUndefined();
    });
});

describe("validateDatabricksHost", () => {
    it("accepts cloud hosts, warns for others, refuses http", () => {
        expect(validateDatabricksHost("https://a.cloud.databricks.com")).toBeUndefined();
        expect(validateDatabricksHost("https://example.com")).toEqual({
            message:
                "This is not a standard Databricks URL. Some features may not work as expected.",
            type: "warning",
        });
        expect(validateDatabricksHost("http://a.cloud.databricks.com")).toBe("Invalid protocol");
    });

    it("offers OAuth on Databricks clouds and PAT everywhere", () => {
        expect(
            profileCreationMethods(normalizeHost("https://adb-1.2.azuredatabricks.net")),
        ).toEqual(["databricks-cli", "pat"]);
        expect(profileCreationMethods(normalizeHost("https://example.com"))).toEqual(["pat"]);
    });
});
