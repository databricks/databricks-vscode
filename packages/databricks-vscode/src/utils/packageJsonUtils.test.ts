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
    parseCliVersion,
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

// Restores EXTENSION_DEVELOPMENT after each test in the enclosing describe, so a
// suite that toggles the dev flag can't leak it into the rest of the run.
function restoreDevFlagAfterEach() {
    const original = process.env[EXTENSION_DEVELOPMENT];
    afterEach(() => {
        if (original === undefined) {
            delete process.env[EXTENSION_DEVELOPMENT];
        } else {
            process.env[EXTENSION_DEVELOPMENT] = original;
        }
    });
}

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

    describe("parseCliVersion", () => {
        it("reads the Version field from `databricks version --output json`", () => {
            assert.equal(parseCliVersion('{"Version": "0.240.0"}'), "0.240.0");
        });

        it("returns undefined when Version is missing", () => {
            assert.equal(parseCliVersion('{"foo": "bar"}'), undefined);
        });

        it("returns undefined when Version is not a string", () => {
            assert.equal(parseCliVersion('{"Version": 240}'), undefined);
        });

        it("returns undefined on malformed JSON", () => {
            assert.equal(parseCliVersion("not json"), undefined);
            assert.equal(parseCliVersion(""), undefined);
        });
    });

    // checkBundledCliVersion paths that never launch the real bundled CLI —
    // they hit the dev-flag / unpinned gate, or fail fast on a missing binary —
    // so they stay fast in the unit suite.
    describe("checkBundledCliVersion gating", () => {
        restoreDevFlagAfterEach();

        it("does not warn outside a dev checkout (no CLI spawn)", async () => {
            delete process.env[EXTENSION_DEVELOPMENT];
            assert.ok(
                await checkBundledCliVersion(cliPath, {
                    packageName: "databricks",
                    version: "2.13.0",
                    cliVersion: `${pinnedCliVersion}-not-the-bundled-version`,
                })
            );
        });

        it("does not warn when the pinned version is unknown", async () => {
            process.env[EXTENSION_DEVELOPMENT] = "true";
            assert.ok(
                await checkBundledCliVersion(
                    path.join(__dirname, "nonexistent-databricks"),
                    {
                        packageName: "databricks",
                        version: "2.13.0",
                    }
                )
            );
        });

        it("returns undefined for a missing binary", async () => {
            assert.equal(
                await getBundledCliVersion(
                    path.join(__dirname, "nonexistent-databricks")
                ),
                undefined
            );
        });

        it("does not warn when the CLI version can't be read but a version is pinned", async () => {
            // Dev checkout with a pinned version, but the CLI is unreadable —
            // the actual version is unknown, so we must not warn (nor throw).
            process.env[EXTENSION_DEVELOPMENT] = "true";
            assert.ok(
                await checkBundledCliVersion(
                    path.join(__dirname, "nonexistent-databricks"),
                    {
                        packageName: "databricks",
                        version: "2.13.0",
                        cliVersion: "0.240.0",
                    }
                )
            );
        });
    });

    // Smoke tests: these spawn the REAL bundled CLI that CI fetches at the
    // pinned version, so they validate the `package:cli:fetch` step, not unit
    // logic (the version parsing is unit-tested above). Cold-spawning a
    // ~50MB binary on the Windows runner exceeds the 2s mocha default, so give
    // the suite a generous timeout — the default made this flake intermittently.
    describe("bundled CLI (smoke — spawns the real fetched binary)", function () {
        this.timeout(30_000);

        restoreDevFlagAfterEach();
        beforeEach(() => {
            process.env[EXTENSION_DEVELOPMENT] = "true";
        });

        it("reports the pinned version", async () => {
            assert.equal(await getBundledCliVersion(cliPath), pinnedCliVersion);
        });

        it("is accepted as matching the pinned version", async () => {
            assert.ok(
                await checkBundledCliVersion(cliPath, {
                    packageName: "databricks",
                    version: "2.13.0",
                    cliVersion: pinnedCliVersion,
                })
            );
        });

        it("is flagged as stale against a different pinned version", async () => {
            assert.ok(
                !(await checkBundledCliVersion(cliPath, {
                    packageName: "databricks",
                    version: "2.13.0",
                    cliVersion: `${pinnedCliVersion}-not-the-bundled-version`,
                }))
            );
        });
    });
});
