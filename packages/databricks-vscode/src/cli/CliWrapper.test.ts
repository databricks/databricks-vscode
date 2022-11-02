import * as assert from "assert";
import {Uri} from "vscode";
import {SyncDestination} from "../configuration/SyncDestination";
import {promisify} from "node:util";
import {execFile as execFileCb} from "node:child_process";

import {CliWrapper} from "./CliWrapper";
import {instance, mock} from "ts-mockito";
import {ApiClient, Repo} from "@databricks/databricks-sdk";

const execFile = promisify(execFileCb);

describe(__filename, () => {
    it("should embed a working bricks CLI", async () => {
        let bricksPath = __dirname + "/../../bin/bricks";
        let result = await execFile(bricksPath, ["--help"]);
        assert.ok(result.stdout.indexOf("bricks") > 0);
    });

    it("should create sync command", async () => {
        const cli = new CliWrapper({
            asAbsolutePath(path: string) {
                return path;
            },
        } as any);
        const mapper = new SyncDestination(
            instance(mock(Repo)),
            Uri.from({
                scheme: "dbws",
                path: "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices",
            }),
            Uri.file("/Users/fabian.jakobs/Desktop/notebook-best-practices")
        );

        const {command, args} = cli.getSyncCommand(mapper);

        assert.equal(
            [command, ...args].join(" "),
            "./bin/bricks sync --remote-path /Repos/fabian.jakobs@databricks.com/notebook-best-practices"
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
