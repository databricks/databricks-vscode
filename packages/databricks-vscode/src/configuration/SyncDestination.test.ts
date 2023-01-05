/* eslint-disable @typescript-eslint/naming-convention */
import {ApiClient, Repo} from "@databricks/databricks-sdk";
import {List} from "@databricks/databricks-sdk/dist/apis/repos";
import assert from "assert";
import {instance, mock, when} from "ts-mockito";
import {Uri} from "vscode";
import {SyncDestination} from "./SyncDestination";

describe(__filename, () => {
    let mockClient: ApiClient;
    before(async () => {
        mockClient = mock(ApiClient);
        when(
            mockClient.request("/api/2.0/repos", "GET", {
                path_prefix:
                    "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices",
            } as List)
        ).thenResolve({
            repos: [
                {
                    id: 1,
                    path: "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices",
                },
            ],
        });
    });
    it("should map a file", async () => {
        const mapper = new SyncDestination(
            instance(mock(Repo)),
            Uri.from({
                scheme: "wsfs",
                path: "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices",
            }),
            Uri.file("/Users/fabian.jakobs/Desktop/notebook-best-practices")
        );

        assert.equal(
            mapper.localToRemote(
                Uri.file(
                    "/Users/fabian.jakobs/Desktop/notebook-best-practices/hello.py"
                )
            ),
            "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices/hello.py"
        );
    });

    it("should prepend '/Workspace' if missing", async () => {
        const mapper = new SyncDestination(
            instance(mock(Repo)),
            Uri.from({
                scheme: "wsfs",
                path: "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices",
            }),
            Uri.file("/Users/fabian.jakobs/Desktop/notebook-best-practices")
        );

        assert.equal(
            mapper.localToRemote(
                Uri.file(
                    "/Users/fabian.jakobs/Desktop/notebook-best-practices/hello.py"
                )
            ),
            "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices/hello.py"
        );
    });

    it("should map a directory", async () => {
        const mapper = new SyncDestination(
            instance(mock(Repo)),
            Uri.from({
                scheme: "wsfs",
                path: "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices",
            }),
            Uri.file("/Users/fabian.jakobs/Desktop/notebook-best-practices")
        );

        assert.equal(
            mapper.localToRemoteDir(
                Uri.file(
                    "/Users/fabian.jakobs/Desktop/notebook-best-practices/jobs/hello.py"
                )
            ),
            "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices/jobs"
        );
    });

    it("should get repo name", async () => {
        const mapper = new SyncDestination(
            instance(mock(Repo)),
            Uri.from({
                scheme: "wsfs",
                path: "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices",
            }),
            Uri.file("/Users/fabian.jakobs/Desktop/notebook-best-practices")
        );

        assert.equal(mapper.name, "notebook-best-practices");
    });

    it("should compute relative repo path", () => {
        const mapper = new SyncDestination(
            instance(mock(Repo)),
            Uri.from({
                scheme: "wsfs",
                path: "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices",
            }),
            Uri.file("/Users/fabian.jakobs/Desktop/notebook-best-practices")
        );

        assert.equal(
            mapper.relativeRepoPath,
            "/Repos/fabian.jakobs@databricks.com/notebook-best-practices"
        );
    });

    it("should map notebooks", async () => {
        const mapper = new SyncDestination(
            instance(mock(Repo)),
            Uri.from({
                scheme: "wsfs",
                path: "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices",
            }),
            Uri.file("/Users/fabian.jakobs/Desktop/notebook-best-practices")
        );

        assert.equal(
            mapper.localToRemoteNotebook(
                Uri.file(
                    "/Users/fabian.jakobs/Desktop/notebook-best-practices/notebooks/covid_eda.py"
                )
            ),
            "/Repos/fabian.jakobs@databricks.com/notebook-best-practices/notebooks/covid_eda"
        );
    });
});
