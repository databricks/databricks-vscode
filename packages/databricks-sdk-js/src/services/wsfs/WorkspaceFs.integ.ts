import assert from "assert";
import {randomUUID} from "crypto";
import {posix} from "path";
import {IntegrationTestSetup} from "../../test/IntegrationTestSetup";
import {WorkspaceFsEntity} from "./WorkspaceFsEntity";

describe(__filename, function () {
    let integSetup: IntegrationTestSetup;
    let testDirPath: string;
    let rootDir: WorkspaceFsEntity;

    this.timeout(10 * 60 * 1000);

    before(async () => {
        integSetup = await IntegrationTestSetup.getInstance();
        const me = (await integSetup.client.currentUser.me()).userName;
        assert.ok(me !== undefined, "No currentUser.userName");

        testDirPath = `/Users/${me}/vscode-integ-tests/${randomUUID()}`;
        await integSetup.client.workspace.mkdirs({
            path: testDirPath,
        });
    });

    beforeEach(async () => {
        const dir = await WorkspaceFsEntity.fromPath(
            integSetup.client,
            testDirPath
        );
        assert.ok(dir !== undefined);
        rootDir = dir;
    });

    it("should should create a directory", async () => {
        const dirPath = `test-${randomUUID()}`;
        const createdDir = await rootDir.mkdir(dirPath);

        assert.ok(createdDir !== undefined);
        assert.ok(createdDir.type === "DIRECTORY");
        assert.ok(createdDir.path === posix.join(testDirPath, dirPath));
        assert.ok((await createdDir.parent)?.path === testDirPath);
    });

    it("should list a directory", async () => {
        const newDirs = [];
        for (let i = 0; i < 5; i++) {
            const dirName = `test-${randomUUID()}`;
            newDirs.push(dirName);
            await rootDir.mkdir(dirName);
        }

        const actual = await rootDir.children;

        newDirs.forEach((dirName) => {
            assert.ok(
                actual.find(
                    (e) => e.path === posix.join(testDirPath, dirName)
                ) !== undefined
            );
        });
    });

    it("should not allow creation of directory in invalid paths", async () => {
        const dirName = `test-${randomUUID()}`;
        const dir = await rootDir.mkdir(dirName);
        assert.ok(dir !== undefined);

        await assert.rejects(async () => await dir.mkdir("/a"));
        await assert.rejects(async () => await dir.mkdir("../../a"));
        await assert.doesNotReject(
            async () => await dir.mkdir(`../${dirName}/a`)
        );
    });
});
