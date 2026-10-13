import {ConfigurationTarget, Uri, WorkspaceFolder, workspace} from "vscode";
import {
    BundleFileSet,
    getAbsoluteGlobPath,
    getSubProjects,
} from "./BundleFileSet";
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
                [
                    Uri.file(sharedFile).fsPath,
                    Uri.file(sharedFile2).fsPath,
                ].sort()
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

        it("getExternalIncludeWatchTargets should only return bases outside the project root", async () => {
            const sharedDir = path.join(tmpdir.path, "shared");
            const projectDir = path.join(tmpdir.path, "project", "sub");
            await fs.mkdir(sharedDir, {recursive: true});
            await fs.mkdir(projectDir, {recursive: true});

            const rootBundleData: BundleSchema = {
                include: [
                    "../../shared/config.yml",
                    "../../shared/*.yml",
                    "local.yml",
                    "includes/**/*.yml",
                ],
            };
            await fs.writeFile(
                path.join(projectDir, "databricks.yml"),
                yaml.stringify(rootBundleData)
            );

            const bundleFileSet = new BundleFileSet(
                getWorkspaceFolderManagerMock(projectDir)
            );

            const targets =
                await bundleFileSet.getExternalIncludeWatchTargets();

            // Only the two ../../shared patterns escape the project root; the
            // in-tree patterns (local.yml, includes/**) are covered by the
            // default recursive watcher and must be excluded.
            const summary = targets
                .map((t) => `${t.baseUri.fsPath}|${t.pattern}`)
                .sort();
            const sharedBase = Uri.file(sharedDir).fsPath;
            expect(summary).to.deep.equal(
                [`${sharedBase}|config.yml`, `${sharedBase}|*.yml`].sort()
            );
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

    describe("getSubProjects", async () => {
        async function writeFile(...segments: string[]) {
            const file = path.join(tmpdir.path, ...segments);
            await fs.mkdir(path.dirname(file), {recursive: true});
            await fs.writeFile(file, "");
        }

        async function getRelativeSubProjects() {
            return (await getSubProjects(Uri.file(tmpdir.path))).map(
                (p) => p.relative
            );
        }

        it("should find nested bundles in order, without the root bundle", async () => {
            await writeFile("databricks.yml");
            await writeFile("b", "bundle.yaml");
            await writeFile("a", "nested", "databricks.yaml");
            await writeFile("node_modules", "pkg", "bundle.yml");

            const subProjects = await getSubProjects(Uri.file(tmpdir.path));

            expect(subProjects.map((p) => p.relative)).to.deep.equal([
                path.join("a", "nested"),
                "b",
                path.join("node_modules", "pkg"),
            ]);
            expect(subProjects[1].absolute.fsPath).to.equal(
                Uri.file(path.join(tmpdir.path, "b")).fsPath
            );
        });

        it("should skip dot-folders", async () => {
            await writeFile(".hidden", "databricks.yml");
            await writeFile("visible", "databricks.yml");

            expect(await getRelativeSubProjects()).to.deep.equal(["visible"]);
        });

        it("should ignore a folder named like a bundle file", async () => {
            await fs.mkdir(path.join(tmpdir.path, "dir", "databricks.yml"), {
                recursive: true,
            });

            expect(await getRelativeSubProjects()).to.deep.equal([]);
        });

        it("should skip folders in files.exclude", async () => {
            await writeFile("excluded", "databricks.yml");
            await writeFile("kept", "databricks.yml");
            const config = workspace.getConfiguration("files");
            const previous = config.inspect("exclude")?.globalValue;
            await config.update(
                "exclude",
                // eslint-disable-next-line @typescript-eslint/naming-convention
                {"**/excluded": true},
                ConfigurationTarget.Global
            );
            try {
                expect(await getRelativeSubProjects()).to.deep.equal(["kept"]);
            } finally {
                await config.update(
                    "exclude",
                    previous,
                    ConfigurationTarget.Global
                );
            }
        });

        it("should match bundle file names in any case on Windows and macOS", async function () {
            if (process.platform !== "win32" && process.platform !== "darwin") {
                this.skip();
            }
            await writeFile("proj", "Databricks.yml");

            expect(await getRelativeSubProjects()).to.deep.equal(["proj"]);
        });

        it("should follow symlinked folders", async function () {
            if (process.platform === "win32") {
                // Creating symlinks needs extra privileges on Windows.
                this.skip();
            }
            const target = await tmp.dir({unsafeCleanup: true});
            try {
                await fs.mkdir(path.join(target.path, "proj"));
                await fs.writeFile(
                    path.join(target.path, "proj", "databricks.yml"),
                    ""
                );
                await fs.symlink(target.path, path.join(tmpdir.path, "linked"));

                expect(await getRelativeSubProjects()).to.deep.equal([
                    path.join("linked", "proj"),
                ]);
            } finally {
                await target.cleanup();
            }
        });

        it("should list a folder reached through symlinks once", async function () {
            if (process.platform === "win32") {
                // Creating symlinks needs extra privileges on Windows.
                this.skip();
            }
            // Bazel links bazel-<name> to its execroot, which links back to
            // each top-level folder and file.
            await writeFile("databricks.yml");
            await writeFile("jobs", "etl", "databricks.yml");
            const execroot = await tmp.dir({unsafeCleanup: true});
            try {
                for (const entry of ["databricks.yml", "jobs"]) {
                    await fs.symlink(
                        path.join(tmpdir.path, entry),
                        path.join(execroot.path, entry)
                    );
                }
                await fs.symlink(
                    execroot.path,
                    path.join(tmpdir.path, "bazel-repo")
                );

                expect(await getRelativeSubProjects()).to.deep.equal([
                    path.join("jobs", "etl"),
                ]);
            } finally {
                await execroot.cleanup();
            }
        });

        it("should skip copies of a bundle in a symlinked build output", async function () {
            if (process.platform === "win32") {
                // Creating symlinks needs extra privileges on Windows.
                this.skip();
            }
            // Build tools link an output folder into the workspace that holds
            // real folders whose files link back to the sources.
            await writeFile("jobs", "etl", "databricks.yml");
            const out = await tmp.dir({unsafeCleanup: true});
            try {
                await fs.mkdir(path.join(out.path, "app", "jobs", "etl"), {
                    recursive: true,
                });
                await fs.symlink(
                    path.join(tmpdir.path, "jobs", "etl", "databricks.yml"),
                    path.join(out.path, "app", "jobs", "etl", "databricks.yml")
                );
                await fs.symlink(out.path, path.join(tmpdir.path, "build-out"));

                expect(await getRelativeSubProjects()).to.deep.equal([
                    path.join("jobs", "etl"),
                ]);
            } finally {
                await out.cleanup();
            }
        });

        it("should list each folder whose bundle file links to a shared one", async function () {
            if (process.platform === "win32") {
                // Creating symlinks needs extra privileges on Windows.
                this.skip();
            }
            await writeFile("shared", "databricks.yml");
            for (const bundle of ["bundle1", "bundle2"]) {
                await fs.mkdir(path.join(tmpdir.path, bundle));
                await fs.symlink(
                    path.join("..", "shared", "databricks.yml"),
                    path.join(tmpdir.path, bundle, "databricks.yml")
                );
            }

            expect(await getRelativeSubProjects()).to.deep.equal([
                "bundle1",
                "bundle2",
                "shared",
            ]);
        });
    });
});
