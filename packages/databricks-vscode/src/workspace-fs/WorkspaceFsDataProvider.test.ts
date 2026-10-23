import assert from "assert";
import {mock, instance, when} from "ts-mockito";
import {WorkspaceFsEntity} from "../sdk-extensions";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {DatabricksWorkspace} from "../configuration/DatabricksWorkspace";
import {WorkspaceFsDataProvider} from "./WorkspaceFsDataProvider";

function entity(path: string, type: string): WorkspaceFsEntity {
    return {path, type} as unknown as WorkspaceFsEntity;
}

function paths(elements: WorkspaceFsEntity[]): string[] {
    return elements.map((e) => e.path);
}

describe("WorkspaceFsDataProvider.sort", () => {
    let provider: WorkspaceFsDataProvider;

    beforeEach(() => {
        const mockDatabricksWorkspace = mock<DatabricksWorkspace>();
        when(mockDatabricksWorkspace.userName).thenReturn("testuser");

        const mockConnectionManager = mock<ConnectionManager>();
        when(mockConnectionManager.databricksWorkspace).thenReturn(
            instance(mockDatabricksWorkspace)
        );
        when(mockConnectionManager.onDidChangeState).thenReturn(() => ({
            dispose() {},
        }));

        provider = new WorkspaceFsDataProvider(instance(mockConnectionManager));
    });

    it("sorts directories alphabetically", () => {
        const sorted = provider.sort([
            entity("/root/reports", "DIRECTORY"),
            entity("/root/alpha", "DIRECTORY"),
            entity("/root/.hidden", "DIRECTORY"),
            entity("/root/beta", "DIRECTORY"),
        ]);

        assert.deepStrictEqual(paths(sorted), [
            "/root/.hidden",
            "/root/alpha",
            "/root/beta",
            "/root/reports",
        ]);
    });

    it("groups directories and repos before files, each alphabetical", () => {
        const sorted = provider.sort([
            entity("/root/file.py", "FILE"),
            entity("/root/zeta", "DIRECTORY"),
            entity("/root/data.csv", "NOTEBOOK"),
            entity("/root/myrepo", "REPO"),
            entity("/root/alpha", "DIRECTORY"),
        ]);

        assert.deepStrictEqual(paths(sorted), [
            "/root/alpha",
            "/root/myrepo",
            "/root/zeta",
            "/root/data.csv",
            "/root/file.py",
        ]);
    });

    it("pins priority paths to the top", () => {
        const sorted = provider.sort([
            entity("/Shared", "DIRECTORY"),
            entity("/Repos", "DIRECTORY"),
            entity("/Users", "DIRECTORY"),
            entity("/Zebra", "DIRECTORY"),
        ]);

        assert.deepStrictEqual(paths(sorted), [
            "/Users",
            "/Shared",
            "/Repos",
            "/Zebra",
        ]);
    });
});
