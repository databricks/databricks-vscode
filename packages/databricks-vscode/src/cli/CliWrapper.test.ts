import * as assert from "assert";
import {Uri} from "vscode";
import {PathMapper} from "../configuration/PathMapper";

import {CliWrapper} from "./CliWrapper";

describe(__filename, () => {
    it("should create sync command", () => {
        const cli = new CliWrapper();
        const mapper = new PathMapper(
            Uri.file(
                "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices"
            ),
            Uri.file("/Users/fabian.jakobs/Desktop/notebook-best-practices")
        );

        const {command, args} = cli.getSyncCommand(
            "DEFAULT",
            "fabian@databricks.com",
            mapper,
            "incremental"
        );

        assert.equal(
            [command, ...args].join(" "),
            "dbx sync repo --profile DEFAULT --user fabian@databricks.com --dest-repo notebook-best-practices"
        );
    });

    it("should create full sync command", () => {
        const cli = new CliWrapper();
        const mapper = new PathMapper(
            Uri.file(
                "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices"
            ),
            Uri.file("/Users/fabian.jakobs/Desktop/notebook-best-practices")
        );

        const {command, args} = cli.getSyncCommand(
            "DEFAULT",
            "fabian@databricks.com",
            mapper,
            "full"
        );

        assert.equal(
            [command, ...args].join(" "),
            "dbx sync repo --profile DEFAULT --user fabian@databricks.com --dest-repo notebook-best-practices --full-sync"
        );
    });

    it("should create an 'add profile' command", () => {
        const cli = new CliWrapper();

        const {command, args} = cli.getAddProfileCommand(
            "DEFAULT",
            new URL("https://databricks.com")
        );

        assert.equal(
            [command, ...args].join(" "),
            "databricks configure --profile DEFAULT --host https://databricks.com/ --token"
        );
    });
});
