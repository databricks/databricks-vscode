import {expect} from "chai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    collectPackageManagerSignals,
    findUvWorkspaceRoot,
    projectHasUvLock,
} from "./packageManagerSignals";

const WORKSPACE_PYPROJECT =
    '[project]\nname = "root"\n\n[tool.uv.workspace]\nmembers = ["bundles/*"]\n';
const MEMBER_PYPROJECT = '[project]\nname = "a"\n';

describe("uv workspace signals", () => {
    let tmp: string;

    const write = (relPath: string, contents: string) => {
        const file = path.join(tmp, relPath);
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, contents);
    };

    beforeEach(() => {
        tmp = fs.realpathSync(
            fs.mkdtempSync(path.join(os.tmpdir(), "uv-workspace-"))
        );
    });

    afterEach(() => {
        fs.rmSync(tmp, {recursive: true, force: true});
    });

    describe("findUvWorkspaceRoot", () => {
        it("finds the root of a member", () => {
            write("pyproject.toml", WORKSPACE_PYPROJECT);
            write("bundles/a/pyproject.toml", MEMBER_PYPROJECT);

            expect(findUvWorkspaceRoot(path.join(tmp, "bundles/a"))).to.equal(
                tmp
            );
        });

        it("finds the root from a nested folder without its own pyproject", () => {
            write("pyproject.toml", WORKSPACE_PYPROJECT);

            expect(
                findUvWorkspaceRoot(path.join(tmp, "bundles/a/src/deep"))
            ).to.equal(tmp);
        });

        it("does not treat the workspace root itself as a member", () => {
            // setup-local at the root provisions the root .venv uv uses, so the
            // managed flow works there.
            write("pyproject.toml", WORKSPACE_PYPROJECT);

            expect(findUvWorkspaceRoot(tmp)).to.equal(undefined);
        });

        it("ignores an ancestor pyproject without a workspace table", () => {
            write("pyproject.toml", '[project]\nname = "root"\n[tool.uv]\n');
            write("bundles/a/pyproject.toml", MEMBER_PYPROJECT);

            expect(findUvWorkspaceRoot(path.join(tmp, "bundles/a"))).to.equal(
                undefined
            );
        });
    });

    describe("collectPackageManagerSignals", () => {
        it("marks a workspace member", () => {
            write("pyproject.toml", WORKSPACE_PYPROJECT);
            write("bundles/a/pyproject.toml", MEMBER_PYPROJECT);

            const signals = collectPackageManagerSignals(
                path.join(tmp, "bundles/a"),
                undefined
            );
            expect(signals.isUvWorkspaceMember).to.equal(true);
        });

        it("does not mark a standalone project", () => {
            write("pyproject.toml", MEMBER_PYPROJECT);

            const signals = collectPackageManagerSignals(tmp, undefined);
            expect(signals.isUvWorkspaceMember).to.equal(false);
        });
    });

    describe("projectHasUvLock", () => {
        it("finds uv.lock in the project folder", () => {
            write("uv.lock", "");

            expect(projectHasUvLock(tmp)).to.equal(true);
        });

        it("finds uv.lock at the workspace root of a member", () => {
            write("pyproject.toml", WORKSPACE_PYPROJECT);
            write("uv.lock", "");
            write("bundles/a/pyproject.toml", MEMBER_PYPROJECT);

            expect(projectHasUvLock(path.join(tmp, "bundles/a"))).to.equal(
                true
            );
        });

        it("ignores uv.lock in a parent folder that is not a workspace root", () => {
            write("uv.lock", "");
            write("bundles/a/pyproject.toml", MEMBER_PYPROJECT);

            expect(projectHasUvLock(path.join(tmp, "bundles/a"))).to.equal(
                false
            );
        });
    });
});
