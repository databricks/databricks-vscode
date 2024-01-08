import * as assert from "assert";
import {Uri} from "vscode";
import {
    LocalUri,
    RemoteUri,
    SyncDestinationMapper,
} from "../sync/SyncDestination";
import {promisify} from "node:util";
import {execFile as execFileCb} from "node:child_process";
import {withFile} from "tmp-promise";
import {writeFile} from "node:fs/promises";

import {CliWrapper} from "./CliWrapper";
import path from "node:path";
import {Context} from "@databricks/databricks-sdk/dist/context";
import {logging} from "@databricks/databricks-sdk";

const execFile = promisify(execFileCb);

describe(__filename, () => {
    it("should embed a working databricks CLI", async () => {
        const cliPath = __dirname + "/../../bin/databricks";
        const result = await execFile(cliPath, ["--help"]);
        assert.ok(result.stdout.indexOf("databricks") > 0);
    });

    it("should create sync commands", async () => {
        const cli = new CliWrapper({
            asAbsolutePath(path: string) {
                return path;
            },
        } as any);
        const mapper = new SyncDestinationMapper(
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

        let {command, args} = cli.getSyncCommand(mapper, "incremental");
        assert.equal(
            [command, ...args].join(" "),
            "./bin/databricks sync . /Repos/fabian.jakobs@databricks.com/notebook-best-practices --watch --output json"
        );

        ({command, args} = cli.getSyncCommand(mapper, "full"));
        assert.equal(
            [command, ...args].join(" "),
            "./bin/databricks sync . /Repos/fabian.jakobs@databricks.com/notebook-best-practices --watch --output json --full"
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

[typo-host]
host = example.com
`
            );

            const logs: {level: string; msg?: string; meta: any}[] = [];
            const profiles = await cli.listProfiles(
                path,
                new Context({
                    logger: logging.NamedLogger.getOrCreate(
                        "cli-wrapper-test",
                        {
                            factory: () => {
                                return {
                                    log: (level, msg, meta) => {
                                        logs.push({level, msg, meta});
                                    },
                                };
                            },
                        }
                    ),
                })
            );
            assert.equal(profiles.length, 2);

            assert.equal(profiles[0].name, "correct");
            assert.equal(profiles[0].host, "https://cloud.databricks.com/");
            assert.equal(profiles[0].authType, "pat");

            assert.equal(profiles[1].name, "no-token");
            assert.equal(profiles[1].host, "https://cloud.databricks.com/");
            assert.equal(profiles[1].authType, "");

            const typoLog = logs.find((log) => log.msg?.includes("typo-host"));
            assert.ok(typoLog !== undefined);
            assert.ok(typoLog.level === "error");
        });
    });
});
