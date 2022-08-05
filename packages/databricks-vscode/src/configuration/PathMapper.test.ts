import assert from "assert";
import {Uri} from "vscode";
import {PathMapper} from "./PathMapper";

describe(__filename, () => {
    it("should map a file", async () => {
        let mapper = new PathMapper(
            Uri.file(
                "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices"
            ),
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
        let mapper = new PathMapper(
            Uri.file(
                "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices"
            ),
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
        let mapper = new PathMapper(
            Uri.file(
                "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices"
            ),
            Uri.file("/Users/fabian.jakobs/Desktop/notebook-best-practices")
        );

        assert.equal(mapper.remoteWorkspaceName, "notebook-best-practices");
    });
});
