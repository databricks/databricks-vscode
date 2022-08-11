import assert from "assert";
import {Uri} from "vscode";
import {SyncDestination} from "./SyncDestination";

describe(__filename, () => {
    it("should map a file", async () => {
        let mapper = new SyncDestination(
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

    it("should prepend '/Workspace' if missing", async () => {
        let mapper = new SyncDestination(
            Uri.file(
                "/Repos/fabian.jakobs@databricks.com/notebook-best-practices"
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
        let mapper = new SyncDestination(
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
        let mapper = new SyncDestination(
            Uri.file(
                "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices"
            ),
            Uri.file("/Users/fabian.jakobs/Desktop/notebook-best-practices")
        );

        assert.equal(mapper.name, "notebook-best-practices");
    });

    it("should map notebooks", async () => {
        let mapper = new SyncDestination(
            Uri.file(
                "/Repos/fabian.jakobs@databricks.com/notebook-best-practices"
            ),
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
