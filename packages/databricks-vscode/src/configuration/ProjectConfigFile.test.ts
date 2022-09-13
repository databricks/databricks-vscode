/* eslint-disable @typescript-eslint/naming-convention */

import {Disposable, Uri, workspace} from "vscode";
import {CliWrapper} from "../cli/CliWrapper";
import {mkdtemp, readFile} from "fs/promises";
import {ProjectConfigFile} from "./ProjectConfigFile";
import * as assert from "assert";
import path from "path";
import * as os from "os";

describe(__filename, () => {
    let tempDir: string;
    before(async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), "ProjectConfTests-"));
    });

    it("should write config file", async () => {
        const expected = {
            clusterId: "testClusterId",
            profile: "testProfile",
            workspacePath: "workspacePath",
        };
        await new ProjectConfigFile(expected, tempDir).write();

        const rawData = await readFile(
            ProjectConfigFile.getProjectConfigFilePath(tempDir),
            {encoding: "utf-8"}
        );
        const actual = JSON.parse(rawData);
        assert.deepEqual(actual, expected);
    });

    it("should load config file", async () => {
        const expected = {
            clusterId: "testClusterId",
            profile: "testProfile",
            workspacePath: "workspacePath",
        };
        const actual = await ProjectConfigFile.load(tempDir);
        assert.deepEqual(actual.config, expected);
    });
});
