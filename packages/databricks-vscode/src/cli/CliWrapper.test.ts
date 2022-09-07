import * as assert from "assert";
import {Uri} from "vscode";
import {SyncDestination} from "../configuration/SyncDestination";
import {ExtensionContext} from "vscode";

import {CliWrapper} from "./CliWrapper";
import {mock, spy} from "ts-mockito";

describe(__filename, () => {
    it("should create sync command", () => {
        const cli = new CliWrapper({
            asAbsolutePath(path: string) {
                return path;
            },
        } as any);
        const mapper = new SyncDestination(
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
        const cli = new CliWrapper({
            asAbsolutePath(path: string) {
                return path;
            },
        } as any);
        const mapper = new SyncDestination(
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
        const cli = new CliWrapper({
            asAbsolutePath(path: string) {
                return path;
            },
        } as any);

        const {command, args} = cli.getAddProfileCommand(
            "DEFAULT",
            new URL("https://databricks.com")
        );

        assert.equal(
            [command, ...args].join(" "),
            "./bin/bricks configure --no-interactive --profile DEFAULT --host https://databricks.com/ --token"
        );
    });
});
