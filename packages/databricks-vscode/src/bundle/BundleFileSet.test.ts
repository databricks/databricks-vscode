import {Uri} from "vscode";
import {BundleFileSet} from "./BundleFileSet";
import {expect} from "chai";
import path from "path";
import * as tmp from "tmp-promise";
import * as fs from "fs/promises";
import {BundleSchema} from "./BundleSchema";
import * as yaml from "yaml";

describe(__filename, async function () {
    let tmpdir: tmp.DirectoryResult;

    beforeEach(async () => {
        tmpdir = await tmp.dir({unsafeCleanup: true});
    });

    afterEach(async () => {
        await tmpdir.cleanup();
    });

    it("should return the correct absolute path", () => {
        const tmpdirUri = Uri.file(tmpdir.path);
        const bundleFileSet = new BundleFileSet(tmpdirUri);

        expect(bundleFileSet.getAbsolutePath("test.txt").fsPath).to.equal(
            path.join(tmpdirUri.fsPath, "test.txt")
        );

        expect(
            bundleFileSet.getAbsolutePath(Uri.file("test.txt")).fsPath
        ).to.equal(path.join(tmpdirUri.fsPath, "test.txt"));
    });

    it("should find the correct root bundle yaml", async () => {
        const tmpdirUri = Uri.file(tmpdir.path);
        const bundleFileSet = new BundleFileSet(tmpdirUri);

        expect(await bundleFileSet.getRootFile()).to.be.undefined;

        await fs.writeFile(path.join(tmpdirUri.fsPath, "bundle.yaml"), "");

        expect((await bundleFileSet.getRootFile())?.fsPath).to.equal(
            path.join(tmpdirUri.fsPath, "bundle.yaml")
        );
    });

    it("should return undefined if more than one root bundle yaml is found", async () => {
        const tmpdirUri = Uri.file(tmpdir.path);
        const bundleFileSet = new BundleFileSet(tmpdirUri);

        await fs.writeFile(path.join(tmpdirUri.fsPath, "bundle.yaml"), "");
        await fs.writeFile(path.join(tmpdirUri.fsPath, "databricks.yaml"), "");

        expect(await bundleFileSet.getRootFile()).to.be.undefined;
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

        it("should return correct included files", async () => {
            const tmpdirUri = Uri.file(tmpdir.path);
            const bundleFileSet = new BundleFileSet(tmpdirUri);

            expect(await bundleFileSet.getIncludedFilesGlob()).to.equal(
                `{included.yaml,${path.join("includes", "**", "*.yaml")}}`
            );

            expect(await bundleFileSet.getIncludedFiles()).to.deep.equal([
                Uri.file(path.join(tmpdirUri.fsPath, "included.yaml")),
                Uri.file(
                    path.join(tmpdirUri.fsPath, "includes", "included.yaml")
                ),
            ]);
        });

        it("should return all bundle files", async () => {
            const tmpdirUri = Uri.file(tmpdir.path);
            const bundleFileSet = new BundleFileSet(tmpdirUri);

            expect(await bundleFileSet.allFiles()).to.deep.equal([
                Uri.joinPath(tmpdirUri, "bundle.yaml"),
                Uri.joinPath(tmpdirUri, "included.yaml"),
                Uri.joinPath(tmpdirUri, "includes", "included.yaml"),
            ]);
        });

        it("isRootBundleFile should return true only for root bundle file", async () => {
            const tmpdirUri = Uri.file(tmpdir.path);
            const bundleFileSet = new BundleFileSet(tmpdirUri);

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
            const bundleFileSet = new BundleFileSet(tmpdirUri);

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
            const bundleFileSet = new BundleFileSet(tmpdirUri);

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
