import assert from "assert";
import {writeFile} from "fs/promises";
import path from "node:path";
import * as tmp from "tmp";
import {anything, instance, mock, when} from "ts-mockito";
import {ExtensionContext} from "vscode";
import {
    checkBundledCliVersion,
    getBundledCliVersion,
    getCorrectVsixInstallString,
    getMetadata,
    isCompatibleArchitecture,
    isEqual,
    nodeArchMap,
    nodeOsMap,
    vsixArchMap,
} from "./packageJsonUtils";
import {EXTENSION_DEVELOPMENT} from "./developmentUtils";

// The real bundled CLI, which CI fetches at the pinned version before running
// the suite. Mirrors CliWrapper.cliPath — `databricks.exe` on Windows.
const cliPath = path.join(
    __dirname,
    "../../bin/" +
        (process.platform === "win32" ? "databricks.exe" : "databricks")
);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pinnedCliVersion = require("../../package.json").cli.version;

describe(__filename, () => {
    it("should correctly check compatibility", () => {
        assert.ok(
            !isCompatibleArchitecture(
                "no match",
                {os: "macos", arch: "arm64"},
                {os: "linux", arch: "arm64"},
                {packageName: "test", version: "0.0.0"}
            )
        );

        assert.ok(
            isCompatibleArchitecture(
                "match",
                {os: "macos", arch: "arm64"},
                {os: "macos", arch: "arm64"},
                {packageName: "test", version: "0.0.0"}
            )
        );
    });

    it("should correctly compare archs", () => {
        assert.ok(
            !isEqual({os: "macos", arch: "arm64"}, {os: "linux", arch: "arm64"})
        );

        assert.ok(
            isEqual({os: "macos", arch: "arm64"}, {os: "macos", arch: "arm64"})
        );
    });

    it("should correctly read metadata", async () => {
        const {name: path} = tmp.fileSync();
        const metaData = {
            name: "name",
            version: "version",
            arch: {
                cliArch: "cliArch",
                vsixArch: "vsixArch",
            },
            commitSha: "commitSha",
            cli: {
                version: "1.11.0",
            },
        };
        await writeFile(path, JSON.stringify(metaData));

        const context = mock<ExtensionContext>();
        when(context.asAbsolutePath(anything())).thenReturn(path);

        const actualMetadata = await getMetadata(instance(context));

        assert.deepEqual(actualMetadata, {
            packageName: "name",
            version: "version",
            cliArch: "cliArch",
            vsixArch: "vsixArch",
            commitSha: "commitSha",
            cliVersion: "1.11.0",
        });
    });

    it("should correctly format vsix install string", () => {
        nodeOsMap.forEach((os) => {
            nodeArchMap.forEach((arch) => {
                const archDetails = {os, arch};
                const actual = getCorrectVsixInstallString(archDetails, {
                    packageName: "name",
                    version: "0.0.0",
                });

                const vsixArchString = Array.from(vsixArchMap).find(
                    (keyValue) => isEqual(keyValue[1], archDetails)
                )?.[0];

                vsixArchString
                    ? assert.equal(
                          actual,
                          `Please install name-${vsixArchString}-0.0.0.vsix`
                      )
                    : assert.equal(
                          actual,
                          "Current system architecture is not supported."
                      );
            });
        });
    });

    describe("bundled CLI version", () => {
        const originalDevFlag = process.env[EXTENSION_DEVELOPMENT];

        beforeEach(() => {
            process.env[EXTENSION_DEVELOPMENT] = "true";
        });

        afterEach(() => {
            if (originalDevFlag === undefined) {
                delete process.env[EXTENSION_DEVELOPMENT];
            } else {
                process.env[EXTENSION_DEVELOPMENT] = originalDevFlag;
            }
        });

        it("should read the version the bundled CLI reports", async () => {
            assert.equal(await getBundledCliVersion(cliPath), pinnedCliVersion);
        });

        it("should accept a CLI matching the pinned version", async () => {
            assert.ok(
                await checkBundledCliVersion(cliPath, {
                    packageName: "databricks",
                    version: "2.13.0",
                    cliVersion: pinnedCliVersion,
                })
            );
        });

        it("should detect a stale CLI", async () => {
            assert.ok(
                !(await checkBundledCliVersion(cliPath, {
                    packageName: "databricks",
                    version: "2.13.0",
                    cliVersion: `${pinnedCliVersion}-not-the-bundled-version`,
                }))
            );
        });

        it("should not warn outside a dev checkout", async () => {
            delete process.env[EXTENSION_DEVELOPMENT];
            assert.ok(
                await checkBundledCliVersion(cliPath, {
                    packageName: "databricks",
                    version: "2.13.0",
                    cliVersion: `${pinnedCliVersion}-not-the-bundled-version`,
                })
            );
        });

        it("should return undefined for a missing binary", async () => {
            assert.equal(
                await getBundledCliVersion(
                    path.join(__dirname, "nonexistent-databricks")
                ),
                undefined
            );
        });

        it("should not warn when the pinned version is unknown", async () => {
            assert.ok(
                await checkBundledCliVersion("/nonexistent/databricks", {
                    packageName: "databricks",
                    version: "2.13.0",
                })
            );
        });
    });
});
