import assert from "assert";
import {posix} from "path";
import {anything, deepEqual, instance, mock, when} from "ts-mockito";
import {WorkspaceClient, workspace} from "@databricks/databricks-sdk";
import {isDirectory} from "./utils";
import {WorkspaceFsEntity} from "./WorkspaceFsEntity";

describe(__filename, () => {
    let mockWorkspaceClient: WorkspaceClient;
    let mockWorkspaceService: workspace.WorkspaceService;

    before(() => {
        mockWorkspaceClient = mock(WorkspaceClient);
        mockWorkspaceService = mock(workspace.WorkspaceService);
        when(mockWorkspaceClient.workspace).thenReturn(
            instance(mockWorkspaceService)
        );
    });

    function mockDirectory(path: string) {
        when(
            mockWorkspaceService.getStatus(deepEqual({path}), anything())
        ).thenResolve({
            // eslint-disable-next-line @typescript-eslint/naming-convention
            object_type: "DIRECTORY",
            // eslint-disable-next-line @typescript-eslint/naming-convention
            object_id: 123,
            path: path,
        });
    }

    it("should return correct absolute child path", async () => {
        const path = "/root/a/b";
        mockDirectory(path);

        const root = await WorkspaceFsEntity.fromPath(
            instance(mockWorkspaceClient),
            path
        );
        assert.ok(isDirectory(root));

        assert.equal(root.getAbsoluteChildPath(path), path);
        assert.equal(
            root.getAbsoluteChildPath(posix.resolve(path, "..", "..")),
            undefined
        );
        assert.equal(
            root.getAbsoluteChildPath(posix.resolve(path, "..")),
            undefined
        );
        assert.ok(
            root.getAbsoluteChildPath(posix.resolve(path, "c", "..", "..")) ===
                undefined
        );
        assert.ok(
            root.getAbsoluteChildPath(posix.resolve(path, "c", "d")) ===
                posix.resolve(path, "c", "d")
        );
    });
});
