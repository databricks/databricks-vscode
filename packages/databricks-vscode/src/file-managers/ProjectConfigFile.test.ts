/* eslint-disable @typescript-eslint/naming-convention */

import {mkdir, mkdtemp, readFile, writeFile} from "fs/promises";
import {ProjectConfigFile} from "./ProjectConfigFile";
import * as assert from "assert";
import path from "path";
import * as os from "os";
import {ProfileAuthProvider} from "../configuration/auth/AuthProvider";
import {LocalUri, RemoteUri} from "../sync/SyncDestination";
import {WorkspaceStateManager} from "../vscode-objs/WorkspaceState";
import {DatabricksYamlFile} from "./DatabricksYamlFile";
import {ProjectJsonFile} from "./ProjectJsonFile";
import * as YAML from "yaml";
import {Uri} from "vscode";

describe(__filename, () => {
    let tempDir: string;
    let mockWorkspaceStateManager: WorkspaceStateManager;
    before(async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), "ProjectConfTests-"));
        const fixedUUID = "uuid1234-something";
        mockWorkspaceStateManager = {
            fixedUUID,
        } as WorkspaceStateManager;
    });

    it("should write project.json and databricks.yaml config files", async () => {
        const authProvider = new ProfileAuthProvider(
            new URL("https://000000000000.00.azuredatabricks.net/"),
            "testProfile"
        );
        await new ProjectConfigFile(
            new ProjectJsonFile(authProvider),
            new DatabricksYamlFile(
                authProvider.host,
                "testClusterId",
                new RemoteUri("workspacePath")
            )
        ).write(new LocalUri(tempDir));

        const packageJsonData = JSON.parse(
            await readFile(
                ProjectJsonFile.getFilePath(new LocalUri(tempDir)).path,
                {encoding: "utf-8"}
            )
        );

        assert.deepEqual(packageJsonData, {
            host: "https://000000000000.00.azuredatabricks.net/",
            authType: "profile",
            profile: "testProfile",
        });

        const yamlData = YAML.parse(
            await readFile(
                DatabricksYamlFile.getFilePath(new LocalUri(tempDir)).path,
                {encoding: "utf-8"}
            )
        );

        assert.deepEqual(yamlData, {
            environments: {
                "databricks-vscode-uuid1234": {
                    compute_id: "testClusterId",
                    mode: "development",
                    workspace: {
                        host: "https://000000000000.00.azuredatabricks.net/",
                        root_path: "workspacePath",
                    },
                },
            },
        });
    });

    it("should load project.json and databricks.yaml config files", async () => {
        const projectJsonFile = ProjectJsonFile.getFilePath(
            new LocalUri(tempDir)
        );
        await mkdir(path.dirname(projectJsonFile.path), {recursive: true});

        const config = {
            host: "https://000000000000.00.azuredatabricks.net/",
            authType: "profile",
            profile: "testProfile",
        };

        await writeFile(projectJsonFile.path, JSON.stringify(config), {
            encoding: "utf-8",
        });

        const environments: any = {};
        (environments[
            `databricks-vscode-${mockWorkspaceStateManager.fixedUUID.slice(
                0,
                8
            )}`
        ] = {
            compute_id: "testClusterId",
            mode: "development",
            workspace: {
                host: "https://000000000000.00.azuredatabricks.net/",
                root_path: "workspacePath",
            },
        }),
            await writeFile(
                DatabricksYamlFile.getFilePath(new LocalUri(tempDir)).path,
                YAML.stringify({
                    environments,
                }),
                {
                    encoding: "utf-8",
                }
            );

        const actual = await ProjectConfigFile.load(
            new LocalUri(tempDir),
            new LocalUri("databricks")
        );
        assert.equal(actual.host.toString(), config.host);
        assert.ok(actual.authProvider instanceof ProfileAuthProvider);
        assert.equal(actual.authProvider.authType, config.authType);
        assert.deepStrictEqual(actual.authProvider.toJSON(), {
            host: config.host.toString(),
            authType: config.authType,
            profile: config.profile,
        });
        assert.deepEqual(
            actual.workspacePath?.uri,
            Uri.from({scheme: "wsfs", path: "workspacePath"})
        );
        assert.equal(actual.clusterId, "testClusterId");
    });

    it("should load legacy project.json config file", async () => {
        const configFile = ProjectJsonFile.getFilePath(new LocalUri(tempDir));
        await mkdir(path.dirname(configFile.path), {recursive: true});

        const config = {
            host: "https://000000000000.00.azuredatabricks.net/",
            authType: "profile",
            profile: "testProfile",
            workspacePath: "workspacePath",
            clusterId: "testClusterId",
        };
        await writeFile(configFile.path, JSON.stringify(config), {
            encoding: "utf-8",
        });

        const actual = await ProjectConfigFile.load(
            new LocalUri(tempDir),
            new LocalUri("databricks")
        );
        assert.equal(actual.host.toString(), config.host);
        assert.ok(actual.authProvider instanceof ProfileAuthProvider);
        assert.equal(actual.authProvider.authType, config.authType);
        assert.deepStrictEqual(actual.authProvider.toJSON(), {
            host: config.host.toString(),
            authType: config.authType,
            profile: config.profile,
        });
        assert.deepEqual(
            actual.workspacePath?.uri,
            Uri.from({scheme: "wsfs", path: config.workspacePath})
        );
        assert.equal(actual.clusterId, config.clusterId);
    });

    it("should load legacy profile auth provider from project.json", async () => {
        const configFile = ProjectJsonFile.getFilePath(new LocalUri(tempDir));
        await mkdir(path.dirname(configFile.path), {recursive: true});

        const config = {
            profile: "testProfile",
            workspacePath: "workspacePath",
            clusterId: "testClusterId",
        };
        await writeFile(configFile.path, JSON.stringify(config), {
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
        const actual = await ProjectConfigFile.load(
            new LocalUri(tempDir),
            new LocalUri("databricks")
        );
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
            actual.workspacePath?.uri,
            Uri.from({scheme: "wsfs", path: config.workspacePath})
        );
        assert.equal(actual.clusterId, config.clusterId);
    });
});
