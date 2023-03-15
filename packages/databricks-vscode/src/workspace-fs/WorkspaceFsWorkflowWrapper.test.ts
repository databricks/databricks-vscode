/* eslint-disable @typescript-eslint/naming-convention */
import {
    ApiClientResponseError,
    WorkspaceClient,
} from "@databricks/databricks-sdk";
import {WorkspaceService} from "@databricks/databricks-sdk/dist/apis/workspace";
import {
    instance,
    mock,
    when,
    anything,
    objectContaining,
    verify,
} from "ts-mockito";
import {ExtensionContext} from "vscode";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {WorkspaceFsWorkflowWrapper} from "./WorkspaceFsWorkflowWrapper";
import {LocalUri, RemoteUri} from "../sync/SyncDestination";
import path, {posix} from "path";
import {readFile, writeFile} from "fs/promises";
import {withFile} from "tmp-promise";

describe(__filename, async () => {
    let mockWorkspaceService: WorkspaceService;
    let mockConnectionManager: ConnectionManager;
    let mockExtensionContext: ExtensionContext;
    const testDirPath = "/Users/me/testdir";
    const resourceDir = path.resolve(
        __dirname,
        "..",
        "..",
        "resources",
        "python"
    );

    console.log(resourceDir);

    beforeEach(async () => {
        mockWorkspaceService = mock(WorkspaceService);
        when(
            mockWorkspaceService.getStatus(
                objectContaining({
                    path: testDirPath,
                }),
                anything()
            )
        ).thenResolve({
            object_id: 1234,
            object_type: "DIRECTORY",
            path: testDirPath,
        });

        const mockWorkspaceClient = mock(WorkspaceClient);
        when(mockWorkspaceClient.workspace).thenReturn(
            instance(mockWorkspaceService)
        );

        mockConnectionManager = mock(ConnectionManager);
        when(mockConnectionManager.workspaceClient).thenReturn(
            instance(mockWorkspaceClient)
        );

        mockExtensionContext = mock<ExtensionContext>();
        when(mockExtensionContext.asAbsolutePath(anything())).thenCall(
            (relativePath: string) => {
                return path.normalize(relativePath);
            }
        );
    });

    it("should create wrapper for files", async () => {
        const originalFilePath = posix.join(testDirPath, "remoteFile.py");
        const wrappedFilePath = posix.join(
            testDirPath,
            "remoteFile.databricks.file.workflow-wrapper.py"
        );
        when(
            mockWorkspaceService.getStatus(
                objectContaining({
                    path: wrappedFilePath,
                }),
                anything()
            )
        ).thenResolve({
            path: wrappedFilePath,
            object_type: "FILE",
            object_id: 1235,
        });

        await new WorkspaceFsWorkflowWrapper(
            instance(mockConnectionManager),
            instance(mockExtensionContext)
        ).createPythonFileWrapper(new RemoteUri(originalFilePath));

        console.error(
            "file",
            path.join(resourceDir, "file.workflow-wrapper.py")
        );

        const wrapperData = await readFile(
            path.join(resourceDir, "file.workflow-wrapper.py"),
            "utf-8"
        );

        console.error(
            "file",
            path.join(resourceDir, "file.workflow-wrapper.py")
        );

        verify(
            mockWorkspaceService.import(
                objectContaining({
                    content: Buffer.from(wrapperData).toString("base64"),
                    path: wrappedFilePath,
                }),
                anything()
            )
        ).once();
    });

    it("should create wrapper for databricks python notebook", async () => {
        await withFile(async (localFilePath) => {
            const originalFilePath = posix.join(testDirPath, "remoteFile.py");
            const wrappedFilePath = posix.join(
                testDirPath,
                "remoteFile.databricks.notebook.workflow-wrapper.py"
            );
            const wrappedNotebookPath = posix.join(
                testDirPath,
                "remoteFile.databricks.notebook.workflow-wrapper"
            );

            when(
                mockWorkspaceService.getStatus(
                    objectContaining({
                        path: wrappedFilePath,
                    }),
                    anything()
                )
            ).thenThrow(
                new ApiClientResponseError("", {}, "RESOURCE_DOES_NOT_EXIST")
            );

            when(
                mockWorkspaceService.getStatus(
                    objectContaining({
                        path: wrappedNotebookPath,
                    }),
                    anything()
                )
            ).thenResolve({
                path: wrappedNotebookPath,
                object_type: "NOTEBOOK",
                object_id: 1236,
            });

            const comment = ["# Databricks notebook source"];
            const data = ["print('hello')", "print('world')"];
            writeFile(
                localFilePath.path,
                comment.concat(data).join("\n"),
                "utf-8"
            );

            await new WorkspaceFsWorkflowWrapper(
                instance(mockConnectionManager),
                instance(mockExtensionContext)
            ).createNotebookWrapper(
                new LocalUri(localFilePath.path),
                new RemoteUri(originalFilePath),
                "PY_DBNB"
            );

            const wrapperData = await readFile(
                path.join(resourceDir, "notebook.workflow-wrapper.py"),
                "utf-8"
            );
            const expected = comment
                .concat(wrapperData.split(/\r?\n/))
                .concat(["# COMMAND ----------"])
                .concat(data)
                .join("\n");

            verify(
                mockWorkspaceService.import(
                    objectContaining({
                        content: Buffer.from(expected).toString("base64"),
                        path: wrappedFilePath,
                    }),
                    anything()
                )
            ).once();
        });
    });

    it("should create wrapper for databricks jupyter notebook", async () => {
        await withFile(async (localFilePath) => {
            const originalFilePath = posix.join(
                testDirPath,
                "remoteFile.ipynb"
            );
            const wrappedFilePath = posix.join(
                testDirPath,
                "remoteFile.databricks.notebook.workflow-wrapper.ipynb"
            );
            const wrappedNotebookPath = posix.join(
                testDirPath,
                "remoteFile.databricks.notebook.workflow-wrapper"
            );

            when(
                mockWorkspaceService.getStatus(
                    objectContaining({
                        path: wrappedFilePath,
                    }),
                    anything()
                )
            ).thenThrow(
                new ApiClientResponseError("", {}, "RESOURCE_DOES_NOT_EXIST")
            );

            when(
                mockWorkspaceService.getStatus(
                    objectContaining({
                        path: wrappedNotebookPath,
                    }),
                    anything()
                )
            ).thenResolve({
                path: wrappedNotebookPath,
                object_type: "NOTEBOOK",
                object_id: 1236,
            });

            const originalData = {
                metadata: {
                    "application/vnd.databricks.v1+notebook": {
                        notebookName: "something",
                        dashboards: [],
                        notebookMetadata: {
                            pythonIndentUnit: 4,
                        },
                        language: "python",
                        widgets: {},
                        notebookOrigID: 2124901766713480,
                    },
                },
                nbformat: 4,
                nbformat_minor: 0,
                cells: [
                    {
                        cell_type: "code",
                        source: ["b = 2"],
                        metadata: {
                            "application/vnd.databricks.v1+cell": {
                                showTitle: false,
                                cellMetadata: {
                                    rowLimit: 10000,
                                    byteLimit: 2048000,
                                },
                                nuid: "1fb559af-eaf5-456f-9e12-c80b82a9baab",
                                inputWidgets: {},
                                title: "",
                            },
                        },
                        outputs: [],
                        execution_count: 0,
                    },
                ],
            };
            writeFile(
                localFilePath.path,
                JSON.stringify(originalData),
                "utf-8"
            );

            await new WorkspaceFsWorkflowWrapper(
                instance(mockConnectionManager),
                instance(mockExtensionContext)
            ).createNotebookWrapper(
                new LocalUri(localFilePath.path),
                new RemoteUri(originalFilePath),
                "IPYNB"
            );

            const wrapperData = await readFile(
                path.join(
                    resourceDir,
                    "generated",
                    "notebook.workflow-wrapper.json"
                ),
                "utf-8"
            );
            const expected = originalData;
            expected.cells = [JSON.parse(wrapperData)].concat(expected.cells);

            verify(
                mockWorkspaceService.import(
                    objectContaining({
                        content: Buffer.from(JSON.stringify(expected)).toString(
                            "base64"
                        ),
                        path: wrappedFilePath,
                    }),
                    anything()
                )
            ).once();
        });
    });
});
