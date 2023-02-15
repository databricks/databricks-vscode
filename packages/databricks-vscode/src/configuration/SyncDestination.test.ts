/* eslint-disable @typescript-eslint/naming-convention */
import {ApiClient} from "@databricks/databricks-sdk";
import {List} from "@databricks/databricks-sdk/dist/apis/repos";
import assert from "assert";
import {mock, when} from "ts-mockito";
import {Uri} from "vscode";
import {LocalUri, RemoteUri, SyncDestinationMapper} from "./SyncDestination";
import * as path from "node:path";

describe(__filename, () => {
    let mapper: SyncDestinationMapper;
    before(async () => {
        mapper = new SyncDestinationMapper(
            new LocalUri(
                Uri.file("/Users/fabian.jakobs/Desktop/notebook-best-practices")
            ),
            new RemoteUri(
                Uri.from({
                    scheme: "wsfs",
                    path: "/Repos/fabian.jakobs@databricks.com/notebook-best-practices",
                })
            )
        );
    });
    it("should map a file", async () => {
        assert.equal(
            mapper.localToRemote(
                new LocalUri(
                    Uri.file(
                        "/Users/fabian.jakobs/Desktop/notebook-best-practices/hello.py"
                    )
                )
            ).path,
            "/Repos/fabian.jakobs@databricks.com/notebook-best-practices/hello.py"
        );
    });

    it("should get repo name", async () => {
        assert.equal(mapper.remoteUri.name, "notebook-best-practices");
    });

    it("should map notebooks", async () => {
        assert.equal(
            mapper.localToRemoteNotebook(
                new LocalUri(
                    Uri.file(
                        "/Users/fabian.jakobs/Desktop/notebook-best-practices/notebooks/covid_eda.py"
                    )
                )
            ).path,
            "/Repos/fabian.jakobs@databricks.com/notebook-best-practices/notebooks/covid_eda"
        );
    });

    if (process.platform === "win32") {
        it("should process windows path correctly", () => {
            mapper = new SyncDestinationMapper(
                new LocalUri(Uri.file("C:\\a\\b\\c")),
                new RemoteUri(
                    Uri.from({
                        scheme: "wsfs",
                        path: "/Repos/fabian.jakobs@databricks.com/notebook-best-practices",
                    })
                )
            );
            assert.equal(
                mapper.localToRemote(new LocalUri(Uri.file("c:\\a\\b\\c\\d")))
                    .path,
                "/Repos/fabian.jakobs@databricks.com/notebook-best-practices/d"
            );
        });
    }
});
