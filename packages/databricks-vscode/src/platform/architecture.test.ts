import { describe, expect, it } from "vitest";
import {
    checkArchitecture,
    correctVsixInstallString,
    nodeArchDetails,
    packageMetadata,
} from "./architecture";

const metadata = { packageName: "databricks", version: "2.20.0" };

describe("checkArchitecture", () => {
    it("passes a development build, which has no arch fields", () => {
        expect(checkArchitecture(metadata, { os: "linux", arch: "x64" })).toBeUndefined();
    });

    it("passes a VSIX and CLI built for this machine", () => {
        expect(
            checkArchitecture(
                { ...metadata, vsixArch: "darwin-arm64", cliArch: "darwin_arm64" },
                { os: "macos", arch: "arm64" },
            ),
        ).toBeUndefined();
    });

    it("names the mismatching part and the VSIX to install", () => {
        expect(
            checkArchitecture(
                { ...metadata, vsixArch: "darwin-arm64" },
                { os: "linux", arch: "arm64" },
            ),
        ).toBe(
            "The extension architecture (macos_arm64) does not match system (linux_arm64). " +
                "Please install databricks-linux-arm64-2.20.0.vsix",
        );
        expect(
            checkArchitecture(
                { ...metadata, vsixArch: "linux-x64", cliArch: "windows_amd64" },
                { os: "linux", arch: "x64" },
            ),
        ).toMatch(/^The databricks-cli architecture \(windows_x64\)/);
    });
});

describe("correctVsixInstallString", () => {
    it("knows every supported machine, and says so for the rest", () => {
        expect(correctVsixInstallString({ os: "windows", arch: "x86_32" }, metadata)).toBe(
            "Please install databricks-win32-ia32-2.20.0.vsix",
        );
        expect(correctVsixInstallString({ os: "macos", arch: "x86_32" }, metadata)).toBe(
            "Current system architecture is not supported.",
        );
    });
});

describe("packageMetadata", () => {
    it("reads the fields the packaging scripts write", () => {
        expect(
            packageMetadata({
                name: "databricks",
                version: "1.0.0",
                arch: { cliArch: "linux_amd64", vsixArch: "linux-x64" },
            }),
        ).toEqual({
            packageName: "databricks",
            version: "1.0.0",
            cliArch: "linux_amd64",
            vsixArch: "linux-x64",
        });
    });

    it("maps Node's platform and arch names", () => {
        expect(nodeArchDetails("win32", "ia32")).toEqual({ os: "windows", arch: "x86_32" });
        expect(nodeArchDetails("aix", "ppc64")).toEqual({ os: undefined, arch: undefined });
    });
});
