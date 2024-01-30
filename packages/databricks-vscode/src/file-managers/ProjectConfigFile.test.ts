/* eslint-disable @typescript-eslint/naming-convention */

import {mkdir, mkdtemp, writeFile} from "fs/promises";
import {ProjectConfigFile} from "./ProjectConfigFile";
import * as assert from "assert";
import path from "path";
import * as os from "os";
import {ProfileAuthProvider} from "../configuration/auth/AuthProvider";
import {Uri} from "vscode";

describe(__filename, () => {
    let tempDir: string;
    before(async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), "ProjectConfTests-"));
    });

    it("should load config file", async () => {
        const configFile = ProjectConfigFile.getProjectConfigFilePath(tempDir);
        await mkdir(path.dirname(configFile), {recursive: true});

        const config = {
            host: "https://000000000000.00.azuredatabricks.net/",
            authType: "profile",
            profile: "testProfile",
            workspacePath: "workspacePath",
            clusterId: "testClusterId",
        };
        await writeFile(configFile, JSON.stringify(config), {
            encoding: "utf-8",
        });

        const actual = (await ProjectConfigFile.load(tempDir, "databricks"))!;
        assert.equal(actual.host.toString(), config.host);
        assert.ok(actual.authProvider instanceof ProfileAuthProvider);
        assert.equal(actual.authProvider.authType, config.authType);
        assert.deepStrictEqual(actual.authProvider.toJSON(), {
            host: config.host.toString(),
            authType: config.authType,
            profile: config.profile,
        });
        assert.deepEqual(
            actual.workspacePath,
            Uri.from({scheme: "wsfs", path: config.workspacePath})
        );
        assert.equal(actual.clusterId, config.clusterId);
    });

    it("should load old config file format", async () => {
        const configFile = ProjectConfigFile.getProjectConfigFilePath(tempDir);
        await mkdir(path.dirname(configFile), {recursive: true});

        console.log(configFile);
        const config = {
            profile: "testProfile",
            workspacePath: "workspacePath",
            clusterId: "testClusterId",
        };
        await writeFile(configFile, JSON.stringify(config), {
            encoding: "utf-8",
        });

        await writeFile(
            path.join(tempDir, ".databrickscfg"),
            `[testProfile]
host = https://000000000000.00.azuredatabricks.net/
token = testToken`,
            {
                encoding: "utf-8",
            }
        );

        process.env.DATABRICKS_CONFIG_FILE = path.join(
            tempDir,
            ".databrickscfg"
        );
        const actual = (await ProjectConfigFile.load(tempDir, "databricks"))!;
        assert.equal(
            actual.host.toString(),
            "https://000000000000.00.azuredatabricks.net/"
        );
        assert.ok(actual.authProvider instanceof ProfileAuthProvider);
        assert.deepStrictEqual(actual.authProvider.toJSON(), {
            host: "https://000000000000.00.azuredatabricks.net/",
            authType: "profile",
            profile: config.profile,
        });
        assert.deepEqual(
            actual.workspacePath,
            Uri.from({scheme: "wsfs", path: config.workspacePath})
        );
        assert.equal(actual.clusterId, config.clusterId);
    });
});
