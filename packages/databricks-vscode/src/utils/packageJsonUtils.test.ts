import assert from "assert";
import {writeFile} from "fs/promises";
import * as tmp from "tmp";
import {anything, instance, mock, when} from "ts-mockito";
import {ExtensionContext} from "vscode";
import {
    getCorrectVsixInstallString,
    getMetadata,
    isCompatibleArchitecture,
    isEqual,
    nodeArchMap,
    nodeOsMap,
    vsixArchMap,
} from "./packageJsonUtils";

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
                bricksArch: "bricksArch",
                vsixArch: "vsixArch",
            },
            commitSha: "commitSha",
        };
        await writeFile(path, JSON.stringify(metaData));

        const context = mock<ExtensionContext>();
        when(context.asAbsolutePath(anything())).thenReturn(path);

        const actualMetadata = await getMetadata(instance(context));

        assert.deepEqual(actualMetadata, {
            packageName: "name",
            version: "version",
            bricksArch: "bricksArch",
            vsixArch: "vsixArch",
            commitSha: "commitSha",
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
});
