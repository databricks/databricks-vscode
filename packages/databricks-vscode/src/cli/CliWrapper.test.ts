import * as assert from "assert";
import {Uri} from "vscode";
import {SyncDestination} from "../configuration/SyncDestination";
import {promisify} from "node:util";
import {execFile as execFileCb} from "node:child_process";
import {withFile} from "tmp-promise";
import {writeFile} from "node:fs/promises";

import {CliWrapper} from "./CliWrapper";
import {instance, mock} from "ts-mockito";
import {WorkspaceFsRepo} from "@databricks/databricks-sdk";
import path from "node:path";

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
            "./bin/bricks sync --remote-path /Repos/fabian.jakobs@databricks.com/notebook-best-practices --watch"
        );

        ({command, args} = cli.getSyncCommand(mapper, "full"));
        assert.equal(
            [command, ...args].join(" "),
            "./bin/bricks sync --remote-path /Repos/fabian.jakobs@databricks.com/notebook-best-practices --watch --full"
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

    it("should list profiles when no config file exists", async () => {
        const cli = new CliWrapper({
            asAbsolutePath(p: string) {
                return path.join(__dirname, "..", "..", p);
            },
        } as any);

        const profiles = await cli.listProfiles("/tmp/does-not-exist");
        assert.equal(profiles.length, 0);
    });

    it("should list profiles", async function () {
        const cli = new CliWrapper({
            asAbsolutePath(p: string) {
                return path.join(__dirname, "..", "..", p);
            },
        } as any);

        await withFile(async ({path}) => {
            await writeFile(
                path,
                `
        host = https://cloud.databricks.com/
        token = dapitest1234

        [STAGING]
        host = https://staging.cloud.databricks.com/
        token = dapitest54321
        `
            );

            const profiles = await cli.listProfiles(path);

            assert.equal(profiles.length, 2);
            assert.equal(profiles[0].name, "DEFAULT");
            assert.equal(profiles[0].host, "https://cloud.databricks.com/");
            assert.equal(profiles[0].authType, "pat");

            assert.equal(profiles[1].name, "STAGING");
            assert.equal(
                profiles[1].host,
                "https://staging.cloud.databricks.com/"
            );
            assert.equal(profiles[1].authType, "pat");
        });
    });

    it("should load all valid profiles and return errors for rest", async () => {
        const cli = new CliWrapper({
            asAbsolutePath(p: string) {
                return path.join(__dirname, "..", "..", p);
            },
        } as any);

        await withFile(async ({path}) => {
            await writeFile(
                path,
                `[correct]
host = https://cloud.databricks.com/
token = dapitest1234

[no-host]
token = dapitest54321

[no-token]
host = https://cloud.databricks.com/

[missing-host-token]
nothing = true
`
            );
            const profiles = await cli.listProfiles(path);
            assert.equal(profiles.length, 2);

            assert.equal(profiles[0].name, "correct");
            assert.equal(profiles[0].host, "https://cloud.databricks.com/");
            assert.equal(profiles[0].authType, "pat");

            assert.equal(profiles[1].name, "no-token");
            assert.equal(profiles[1].host, "https://cloud.databricks.com/");
            assert.equal(profiles[1].authType, "");
        });
    });
});
