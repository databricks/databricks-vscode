import {Uri, WorkspaceFolder} from "vscode";
import {
    BundleFileSet,
    getAbsoluteGlobPath,
    parseBundleYaml,
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

    it("applies `<<` merge keys like the CLI's Go yaml", async () => {
        // Without {merge: true} the JS parser (YAML 1.2) treats `<<` as an
        // ordinary key, so this target's workspace.host would read as the
        // top-level session host here while the CLI resolves the merged host —
        // the divergence the remote-mode credential guard must not have.
        const file = path.join(tmpdir.path, "databricks.yml");
        await fs.writeFile(
            file,
            [
                "x-ws: &other",
                "  host: https://other-workspace.example.com",
                "workspace:",
                "  host: https://session-host.example.com",
                "targets:",
                "  dev:",
                "    default: true",
                "    workspace:",
                "      <<: *other",
                "",
            ].join("\n")
        );

        const data = await parseBundleYaml(Uri.file(file));

        const devWorkspace = data.targets?.dev?.workspace as
            | Record<string, unknown>
            | undefined;
        expect(devWorkspace?.host).to.equal(
            "https://other-workspace.example.com"
        );
        expect(devWorkspace).to.not.have.property("<<");
    });

    it("getIncludedFiles matches dotfiles like the CLI's Go glob", async () => {
        // Go's filepath.Glob (the CLI) matches dotfiles with `*`; node-glob
        // skips them unless {dot: true}. A dotfile include that sets
        // workspace.host must be visible to the extension, or the remote-mode
        // credential guard reads a different host than the CLI resolves and
        // could send the session token there.
        const targetsDir = path.join(tmpdir.path, "targets");
        await fs.mkdir(targetsDir);
        const dotfile = path.join(targetsDir, ".prod.yml");
        const regular = path.join(targetsDir, "dev.yml");
        await fs.writeFile(dotfile, "");
        await fs.writeFile(regular, "");

        const rootBundleData: BundleSchema = {
            include: [path.join("targets", "*.yml")],
        };
        await fs.writeFile(
            path.join(tmpdir.path, "databricks.yml"),
            yaml.stringify(rootBundleData)
        );

        const bundleFileSet = new BundleFileSet(
            getWorkspaceFolderManagerMock()
        );
        const files = (await bundleFileSet.getIncludedFiles())?.map(
            (f) => f.fsPath
        );
        expect(files).to.include(Uri.file(dotfile).fsPath);
        expect(files).to.include(Uri.file(regular).fsPath);
    });

    it("isIncludedBundleFile matches a dotfile include", async () => {
        const rootBundleData: BundleSchema = {
            include: [path.join("targets", "*.yml")],
        };
        await fs.writeFile(
            path.join(tmpdir.path, "databricks.yml"),
            yaml.stringify(rootBundleData)
        );

        const bundleFileSet = new BundleFileSet(
            getWorkspaceFolderManagerMock()
        );
        expect(
            await bundleFileSet.isIncludedBundleFile(
                Uri.file(path.join(tmpdir.path, "targets", ".prod.yml"))
            )
        ).to.be.true;
    });

    it("getIncludedFiles sorts each pattern's matches byte-wise like the CLI (Repro A)", async () => {
        // The CLI sorts each pattern's matches (Go sort.Strings) and lets the
        // last file win on merge; node-glob's order is filesystem-dependent. If
        // a host is split across targets/a.yml and targets/z.yml, an unsorted
        // list could merge the wrong one and the remote-mode credential guard
        // would read a host the CLI never deploys to. Create z.yml before a.yml
        // so a naive readdir order wouldn't already be sorted.
        const targetsDir = path.join(tmpdir.path, "targets");
        await fs.mkdir(targetsDir);
        await fs.writeFile(path.join(targetsDir, "z.yml"), "");
        await fs.writeFile(path.join(targetsDir, "a.yml"), "");

        const rootBundleData: BundleSchema = {
            include: [path.join("targets", "*.yml")],
        };
        await fs.writeFile(
            path.join(tmpdir.path, "databricks.yml"),
            yaml.stringify(rootBundleData)
        );

        const bundleFileSet = new BundleFileSet(
            getWorkspaceFolderManagerMock()
        );
        const files = (await bundleFileSet.getIncludedFiles())?.map(
            (f) => f.fsPath
        );
        expect(files).to.deep.equal([
            Uri.file(path.join(targetsDir, "a.yml")).fsPath,
            Uri.file(path.join(targetsDir, "z.yml")).fsPath,
        ]);
    });

    it("getIncludedFiles treats ** as one level like the CLI's Go glob (Repro B)", async () => {
        // Go's filepath.Glob has no `**`, so `conf/**/*.yml` reaches exactly one
        // directory deep. node-glob's recursive `**` would merge files the CLI
        // never loads, so the guard could read a host from outside the deployed
        // bundle. {noglobstar: true} matches the CLI: conf/a/x.yml loads,
        // conf/a/b/dev.yml does not.
        const confA = path.join(tmpdir.path, "conf", "a");
        const confAB = path.join(confA, "b");
        await fs.mkdir(confAB, {recursive: true});
        const shallow = path.join(confA, "x.yml");
        const deep = path.join(confAB, "dev.yml");
        await fs.writeFile(shallow, "");
        await fs.writeFile(deep, "");

        const rootBundleData: BundleSchema = {
            include: [path.join("conf", "**", "*.yml")],
        };
        await fs.writeFile(
            path.join(tmpdir.path, "databricks.yml"),
            yaml.stringify(rootBundleData)
        );

        const bundleFileSet = new BundleFileSet(
            getWorkspaceFolderManagerMock()
        );
        const files = (await bundleFileSet.getIncludedFiles())?.map(
            (f) => f.fsPath
        );
        expect(files).to.include(Uri.file(shallow).fsPath);
        expect(files).to.not.include(Uri.file(deep).fsPath);
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
            // `includes/**/*.yaml` reaches exactly one directory deep (Go glob
            // semantics, {noglobstar: true}), so the matched file lives in a
            // subdirectory of `includes`, not directly in it.
            await fs.mkdir(path.join(tmpdir.path, "includes", "nested"), {
                recursive: true,
            });
            await fs.writeFile(
                path.join(tmpdir.path, "includes", "nested", "included.yaml"),
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
                Uri.joinPath(tmpdirUri, "includes", "nested", "included.yaml"),
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
                        path.join(
                            tmpdirUri.fsPath,
                            "includes",
                            "nested",
                            "included.yaml"
                        )
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
                path.join("includes", "nested", "included.yaml"),
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
