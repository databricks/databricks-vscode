import * as assert from "assert";
import {Uri} from "vscode";
import {SyncDestination} from "../configuration/SyncDestination";
import {promisify} from "node:util";
import {execFile as execFileCb} from "node:child_process";

import {CliWrapper} from "./CliWrapper";

const execFile = promisify(execFileCb);

describe(__filename, () => {
    it("should embed a working bricks CLI", async () => {
        let bricksPath = __dirname + "/../../bin/bricks";
        let result = await execFile(bricksPath, ["--help"]);
        assert.ok(result.stdout.indexOf("bricks") > 0);
    });

    it("should create sync command", () => {
        const cli = new CliWrapper({
            asAbsolutePath(path: string) {
                return path;
            },
        } as any);
        const mapper = new SyncDestination(
            Uri.from({
                scheme: "dbws",
                path: "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices",
            }),
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
            Uri.from({
                scheme: "dbws",
                path: "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices",
            }),
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
