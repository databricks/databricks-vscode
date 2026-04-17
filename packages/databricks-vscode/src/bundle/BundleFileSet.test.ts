import {Uri, WorkspaceFolder} from "vscode";
import {BundleFileSet, getAbsoluteGlobPath} from "./BundleFileSet";
import {expect} from "chai";
import path from "path";
import * as tmp from "tmp-promise";
import * as fs from "fs/promises";
import {BundleSchema} from "./types";
import * as yaml from "yaml";
import {instance, mock, when} from "ts-mockito";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";

describe(__filename, async function () {
    let tmpdir: tmp.DirectoryResult;

    beforeEach(async () => {
        tmpdir = await tmp.dir({unsafeCleanup: true});
    });

    afterEach(async () => {
        await tmpdir.cleanup();
    });

    function getWorkspaceFolderManagerMock(projectDir?: string) {
        const mockWorkspaceFolderManager = mock<WorkspaceFolderManager>();
        const mockWorkspaceFolder = mock<WorkspaceFolder>();
        const uri = Uri.file(projectDir ?? tmpdir.path);
        when(mockWorkspaceFolder.uri).thenReturn(uri);
        when(mockWorkspaceFolderManager.activeWorkspaceFolder).thenReturn(
            instance(mockWorkspaceFolder)
        );
        when(mockWorkspaceFolderManager.activeProjectUri).thenReturn(uri);
        return instance(mockWorkspaceFolderManager);
    }

    it("should return the correct absolute glob path", () => {
        const tmpdirUri = Uri.file(tmpdir.path);
        let expectedGlob = path.join(tmpdirUri.fsPath, "test.txt");
        if (process.platform === "win32") {
            expectedGlob = expectedGlob.replace(/\\/g, "/");
        }
        expect(getAbsoluteGlobPath("test.txt", tmpdirUri)).to.equal(
            expectedGlob
        );
        expect(getAbsoluteGlobPath(Uri.file("test.txt"), tmpdirUri)).to.equal(
            expectedGlob
        );
    });

    it("should find the correct root bundle yaml", async () => {
        const tmpdirUri = Uri.file(tmpdir.path);
        const bundleFileSet = new BundleFileSet(
            getWorkspaceFolderManagerMock()
        );

        expect(await bundleFileSet.getRootFile()).to.be.undefined;

        await fs.writeFile(path.join(tmpdirUri.fsPath, "bundle.yaml"), "");

        expect((await bundleFileSet.getRootFile())?.fsPath).to.equal(
            path.join(tmpdirUri.fsPath, "bundle.yaml")
        );
    });

    it("should return undefined if more than one root bundle yaml is found", async () => {
        const tmpdirUri = Uri.file(tmpdir.path);
        const bundleFileSet = new BundleFileSet(
            getWorkspaceFolderManagerMock()
        );

        await fs.writeFile(path.join(tmpdirUri.fsPath, "bundle.yaml"), "");
        await fs.writeFile(path.join(tmpdirUri.fsPath, "databricks.yaml"), "");

        expect(await bundleFileSet.getRootFile()).to.be.undefined;
    });

    describe("parent-directory includes", async () => {
        it("getIncludedFiles should find files referenced via .. paths", async () => {
            // Structure: tmpdir/shared/config.yml (included), tmpdir/project/sub/ (project root)
            const sharedDir = path.join(tmpdir.path, "shared");
            const projectDir = path.join(tmpdir.path, "project", "sub");
            await fs.mkdir(sharedDir, {recursive: true});
            await fs.mkdir(projectDir, {recursive: true});

            const sharedFile = path.join(sharedDir, "config.yml");
            const sharedFile2 = path.join(sharedDir, "config2.yml");
            await fs.writeFile(sharedFile, "");
            await fs.writeFile(sharedFile2, "");

            const rootBundleData: BundleSchema = {
                include: [
                    "../../shared/config.yml",
                    "../../shared/config2.yml",
                ],
            };
            await fs.writeFile(
                path.join(projectDir, "databricks.yml"),
                yaml.stringify(rootBundleData)
            );

            const bundleFileSet = new BundleFileSet(
                getWorkspaceFolderManagerMock(projectDir)
            );

            const files = await bundleFileSet.getIncludedFiles();
            expect(files).to.not.be.undefined;
            expect(files!.map((f) => f.fsPath).sort()).to.deep.equal(
                [sharedFile, sharedFile2].sort()
            );
        });

        it("isIncludedBundleFile should return true for files referenced via .. paths", async () => {
            const sharedDir = path.join(tmpdir.path, "shared");
            const projectDir = path.join(tmpdir.path, "project", "sub");
            await fs.mkdir(sharedDir, {recursive: true});
            await fs.mkdir(projectDir, {recursive: true});

            const sharedFile = path.join(sharedDir, "config.yml");
            await fs.writeFile(sharedFile, "");

            const rootBundleData: BundleSchema = {
                include: ["../../shared/config.yml", "local.yml"],
            };
            await fs.writeFile(
                path.join(projectDir, "databricks.yml"),
                yaml.stringify(rootBundleData)
            );

            const bundleFileSet = new BundleFileSet(
                getWorkspaceFolderManagerMock(projectDir)
            );

            expect(
                await bundleFileSet.isIncludedBundleFile(Uri.file(sharedFile))
            ).to.be.true;

            expect(
                await bundleFileSet.isIncludedBundleFile(
                    Uri.file(path.join(projectDir, "other.yml"))
                )
            ).to.be.false;
        });
    });

    describe("file listing", async () => {
        beforeEach(async () => {
            const rootBundleData: BundleSchema = {
                include: [
                    "included.yaml",
                    path.join("includes", "**", "*.yaml"),
                ],
            };

            await fs.writeFile(
                path.join(tmpdir.path, "bundle.yaml"),
                yaml.stringify(rootBundleData)
            );

            await fs.writeFile(path.join(tmpdir.path, "included.yaml"), "");
            await fs.writeFile(path.join(tmpdir.path, "notIncluded.yaml"), "");
            await fs.mkdir(path.join(tmpdir.path, "includes"));
            await fs.writeFile(
                path.join(tmpdir.path, "includes", "included.yaml"),
                ""
            );
        });

        it("should return all bundle files", async () => {
            const tmpdirUri = Uri.file(tmpdir.path);
            const bundleFileSet = new BundleFileSet(
                getWorkspaceFolderManagerMock()
            );

            const actual = (await bundleFileSet.allFiles()).map(
                (v) => v.fsPath
            );
            const expected = [
                Uri.joinPath(tmpdirUri, "bundle.yaml"),
                Uri.joinPath(tmpdirUri, "included.yaml"),
                Uri.joinPath(tmpdirUri, "includes", "included.yaml"),
            ].map((v) => v.fsPath);
            expect(actual).to.deep.equal(expected);
        });

        it("isRootBundleFile should return true only for root bundle file", async () => {
            const tmpdirUri = Uri.file(tmpdir.path);
            const bundleFileSet = new BundleFileSet(
                getWorkspaceFolderManagerMock()
            );

            const possibleRoots = [
                "bundle.yaml",
                "bundle.yml",
                "databricks.yaml",
                "databricks.yml",
            ];

            for (const root of possibleRoots) {
                expect(
                    bundleFileSet.isRootBundleFile(
                        Uri.file(path.join(tmpdirUri.fsPath, root))
                    )
                ).to.be.true;
            }

            expect(
                bundleFileSet.isRootBundleFile(
                    Uri.file(path.join(tmpdirUri.fsPath, "bundle-wrong.yaml"))
                )
            ).to.be.false;
        });

        it("isIncludedBundleFile should return true only for included files", async () => {
            const tmpdirUri = Uri.file(tmpdir.path);
            const bundleFileSet = new BundleFileSet(
                getWorkspaceFolderManagerMock()
            );

            expect(
                await bundleFileSet.isIncludedBundleFile(
                    Uri.file(path.join(tmpdirUri.fsPath, "included.yaml"))
                )
            ).to.be.true;

            expect(
                await bundleFileSet.isIncludedBundleFile(
                    Uri.file(
                        path.join(tmpdirUri.fsPath, "includes", "included.yaml")
                    )
                )
            ).to.be.true;

            expect(
                await bundleFileSet.isIncludedBundleFile(
                    Uri.file(path.join(tmpdirUri.fsPath, "notIncluded.yaml"))
                )
            ).to.be.false;
        });

        it("isBundleFile should return true only for bundle files", async () => {
            const tmpdirUri = Uri.file(tmpdir.path);
            const bundleFileSet = new BundleFileSet(
                getWorkspaceFolderManagerMock()
            );

            const possibleBundleFiles = [
                "bundle.yaml",
                "bundle.yml",
                "databricks.yaml",
                "databricks.yml",
                "included.yaml",
                path.join("includes", "included.yaml"),
            ];

            for (const bundleFile of possibleBundleFiles) {
                expect(
                    await bundleFileSet.isBundleFile(
                        Uri.file(path.join(tmpdirUri.fsPath, bundleFile))
                    )
                ).to.be.true;
            }

            expect(
                await bundleFileSet.isBundleFile(
                    Uri.file(path.join(tmpdirUri.fsPath, "notIncluded.yaml"))
                )
            ).to.be.false;
        });
    });
});
