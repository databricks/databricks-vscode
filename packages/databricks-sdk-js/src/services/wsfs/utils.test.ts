import assert from "assert";
import {anything, deepEqual, instance, mock, when} from "ts-mockito";
import {WorkspaceService} from "../../apis/workspace";
import {WorkspaceClient} from "../../WorkspaceClient";
import {isDirectory, isFile, isNotebook, isRepo} from "./utils";
import {WorkspaceFsEntity} from "./WorkspaceFsEntity";

describe(__filename, () => {
    let mockWorkspaceClient: WorkspaceClient;

    beforeEach(() => {
        mockWorkspaceClient = mock(WorkspaceClient);
        const mockWorkspaceService = mock(WorkspaceService);
        when(mockWorkspaceClient.workspace).thenReturn(
            instance(mockWorkspaceService)
        );

        when(
            mockWorkspaceService.getStatus(
                deepEqual({path: "/file"}),
                anything()
            )
        ).thenResolve({
            path: "/file",
            object_id: 12345,
            object_type: "FILE",
            language: "PYTHON",
        });

        when(
            mockWorkspaceService.getStatus(
                deepEqual({path: "/notebook"}),
                anything()
            )
        ).thenResolve({
            path: "/notebook",
            object_id: 12345,
            object_type: "NOTEBOOK",
            language: "PYTHON",
        });

        when(
            mockWorkspaceService.getStatus(
                deepEqual({path: "/dir"}),
                anything()
            )
        ).thenResolve({
            path: "/dir",
            object_id: 12345,
            object_type: "DIRECTORY",
        });

        when(
            mockWorkspaceService.getStatus(
                deepEqual({path: "/repo"}),
                anything()
            )
        ).thenResolve({
            path: "/repo",
            object_id: 12345,
            object_type: "REPO",
        });
    });

    it("should type discriminate files", async () => {
        const file = await WorkspaceFsEntity.fromPath(
            instance(mockWorkspaceClient),
            "/file"
        );
        assert.ok(isFile(file));
        assert.ok(!isNotebook(file));
        assert.ok(!isDirectory(file));
        assert.ok(!isRepo(file));
    });

    it("should type discriminate notebook", async () => {
        const file = await WorkspaceFsEntity.fromPath(
            instance(mockWorkspaceClient),
            "/notebook"
        );

        assert.ok(isFile(file));
        assert.ok(isNotebook(file));
        assert.ok(!isDirectory(file));
        assert.ok(!isRepo(file));
    });

    it("should type discriminate dir", async () => {
        const file = await WorkspaceFsEntity.fromPath(
            instance(mockWorkspaceClient),
            "/dir"
        );
        assert.ok(!isFile(file));
        assert.ok(!isNotebook(file));
        assert.ok(isDirectory(file));
        assert.ok(!isRepo(file));
    });

    it("should type discriminate repo", async () => {
        const file = await WorkspaceFsEntity.fromPath(
            instance(mockWorkspaceClient),
            "/repo"
        );
        assert.ok(!isFile(file));
        assert.ok(!isNotebook(file));
        assert.ok(isDirectory(file));
        assert.ok(isRepo(file));
    });
});
