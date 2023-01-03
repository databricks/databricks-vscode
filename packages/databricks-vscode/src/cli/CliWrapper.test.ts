import * as assert from "assert";
import {Uri} from "vscode";
import {SyncDestination} from "../configuration/SyncDestination";
import {promisify} from "node:util";
import {execFile as execFileCb} from "node:child_process";

import {CliWrapper} from "./CliWrapper";
import {instance, mock} from "ts-mockito";
import {WorkspaceFsRepo} from "@databricks/databricks-sdk";

const execFile = promisify(execFileCb);

describe(__filename, () => {
    it("should embed a working bricks CLI", async () => {
        const bricksPath = __dirname + "/../../bin/bricks";
        const result = await execFile(bricksPath, ["--help"]);
        assert.ok(result.stdout.indexOf("bricks") > 0);
    });

    it("should create sync commands", async () => {
        const cli = new CliWrapper({
            asAbsolutePath(path: string) {
                return path;
            },
        } as any);
        const mapper = new SyncDestination(
            instance(mock(WorkspaceFsRepo)),
            Uri.from({
                scheme: "wsfs",
                path: "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices",
            }),
            Uri.file("/Users/fabian.jakobs/Desktop/notebook-best-practices")
        );

        let {command, args} = cli.getSyncCommand(mapper, "incremental");
        assert.equal(
            [command, ...args].join(" "),
            "./bin/bricks sync --remote-path /Repos/fabian.jakobs@databricks.com/notebook-best-practices"
        );

        ({command, args} = cli.getSyncCommand(mapper, "full"));
        assert.equal(
            [command, ...args].join(" "),
            "./bin/bricks sync --remote-path /Repos/fabian.jakobs@databricks.com/notebook-best-practices --persist-snapshot=false"
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
