/* eslint-disable @typescript-eslint/naming-convention */
import {ApiError, WorkspaceClient, workspace} from "@databricks/databricks-sdk";
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
    let mockWorkspaceService: workspace.WorkspaceService;
    let mockConnectionManager: ConnectionManager;
    let mockExtensionContext: ExtensionContext;
    const testDirPath = "/Users/me/testdir";
    const extensionRootDirPath = path.resolve(__dirname, "..", "..");
    const resourceDirPath = path.resolve(
        extensionRootDirPath,
        "resources",
        "python"
    );

    function verifyMockServiceCalledWithExpectedData(
        expected: string,
        wrappedFilePath: string
    ) {
        verify(
            mockWorkspaceService.import(
                objectContaining({
                    content: Buffer.from(expected).toString("base64"),
                    path: wrappedFilePath,
                }),
                anything()
            )
        ).once();
    }

    function createMocks() {
        mockWorkspaceService = mock(workspace.WorkspaceService);
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
                return path.resolve(extensionRootDirPath, relativePath);
            }
        );
    }

    async function getWrapperData(
        wrapperName:
            | "notebook.workflow-wrapper.py"
            | "file.workflow-wrapper.py",
        originalFilePath: string
    ) {
        return (
            await readFile(path.join(resourceDirPath, wrapperName), "utf-8")
        )
            .replace(
                "{{DATABRICKS_SOURCE_FILE}}",
                new RemoteUri(originalFilePath).workspacePrefixPath
            )
            .replace(
                "{{DATABRICKS_PROJECT_ROOT}}",
                new RemoteUri(testDirPath).workspacePrefixPath
            );
    }

    describe("python files", () => {
        beforeEach(createMocks);
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
            ).createPythonFileWrapper(
                new RemoteUri(originalFilePath),
                new RemoteUri(testDirPath)
            );

            const wrapperData = await getWrapperData(
                "file.workflow-wrapper.py",
                originalFilePath
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
    });

    describe("dbnb notebooks", () => {
        let originalFilePath: string;
        let wrappedFilePath: string;

        beforeEach(() => {
            createMocks();
            originalFilePath = posix.join(testDirPath, "remoteFile.py");
            wrappedFilePath = posix.join(
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
                new ApiError(
                    "RESOURCE_DOES_NOT_EXIST",
                    "RESOURCE_DOES_NOT_EXIST",
                    404,
                    {},
                    []
                )
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
        });

        it("should create wrapper for databricks python notebook", async () => {
            await withFile(async (localFilePath) => {
                const comment = ["# Databricks notebook source"];
                const data = ["print('hello')", "print('world')"];
                await writeFile(
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
                    new RemoteUri(testDirPath),
                    "PY_DBNB"
                );

                const wrapperData = await getWrapperData(
                    "notebook.workflow-wrapper.py",
                    originalFilePath
                );
                const expected = comment
                    .concat(wrapperData.split(/\r?\n/))
                    .concat(["# COMMAND ----------"])
                    .concat(data)
                    .join("\n");

                verifyMockServiceCalledWithExpectedData(
                    expected,
                    wrappedFilePath
                );
            });
        });

        it("should rearrange kernel restart commands to the beginning", async () => {
            await withFile(async (localFilePath) => {
                const comment = ["# Databricks notebook source"];
                const data = [
                    "print('hello')",
                    "print('world')",
                    "# COMMAND ----------",
                    "# MAGIC %pip install pandas",
                    "# COMMAND ----------",
                    "dbutils.library.restartPython()",
                    "print('hello2')",
                ];
                await writeFile(
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
                    new RemoteUri(testDirPath),
                    "PY_DBNB"
                );

                const wrapperData = await getWrapperData(
                    "notebook.workflow-wrapper.py",
                    originalFilePath
                );
                const expected = comment
                    .concat([
                        "import os",
                        `os.chdir(os.path.dirname('${
                            new RemoteUri(originalFilePath).workspacePrefixPath
                        }'))`,
                        "# MAGIC %pip install pandas",
                        "# COMMAND ----------",
                        "dbutils.library.restartPython()",
                        "# COMMAND ----------",
                    ])
                    .concat(wrapperData.split(/\r?\n/))
                    .concat([
                        "# COMMAND ----------",
                        "print('hello')",
                        "print('world')",
                        "# COMMAND ----------",
                        "print('hello2')",
                    ])
                    .join("\n");

                verifyMockServiceCalledWithExpectedData(
                    expected,
                    wrappedFilePath
                );
            });
        });
    });

    describe("ipynb notebooks", () => {
        let originalFilePath: string;
        let wrappedFilePath: string;

        beforeEach(() => {
            createMocks();
            originalFilePath = posix.join(testDirPath, "remoteFile.ipynb");
            wrappedFilePath = posix.join(
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
                new ApiError(
                    "RESOURCE_DOES_NOT_EXIST",
                    "RESOURCE_DOES_NOT_EXIST",
                    404,
                    {},
                    []
                )
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
        });

        async function getWrapperData() {
            const wrapperData = JSON.parse(
                (
                    await readFile(
                        path.join(
                            resourceDirPath,
                            "generated",
                            "notebook.workflow-wrapper.json"
                        ),
                        "utf-8"
                    )
                )
                    .replace(
                        "{{DATABRICKS_SOURCE_FILE}}",
                        new RemoteUri(originalFilePath).workspacePrefixPath
                    )
                    .replace(
                        "{{DATABRICKS_PROJECT_ROOT}}",
                        new RemoteUri(testDirPath).workspacePrefixPath
                    )
            );

            wrapperData.source = wrapperData.source.map((cell: string) =>
                cell.trimEnd()
            );
            return wrapperData;
        }

        const notebookMetadata = {
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
        };

        const cellMetadata = {
            cell_type: "code",
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
            execution_count: null,
        };

        it("should create wrapper for databricks jupyter notebook", async () => {
            await withFile(async (localFilePath) => {
                const originalData = {
                    ...notebookMetadata,
                    cells: [{...cellMetadata, source: ["b = 2"]}],
                };
                await writeFile(
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
                    new RemoteUri(testDirPath),
                    "IPYNB"
                );

                const wrapperData = await getWrapperData();
                const expected = originalData;
                expected.cells = [wrapperData].concat(expected.cells);

                verifyMockServiceCalledWithExpectedData(
                    JSON.stringify(expected),
                    wrappedFilePath
                );
            });
        });

        it("should rearrange kernel restart commands to the beginning", async () => {
            await withFile(async (localFilePath) => {
                const originalData = {
                    ...notebookMetadata,
                    cells: [
                        {...cellMetadata, source: ["print('hello')"]},
                        {...cellMetadata, source: ["%pip install x"]},
                        {
                            ...cellMetadata,
                            source: [
                                "dbutils.library.restartPython()\nprint('hello2')\n",
                            ],
                        },
                    ],
                };
                await writeFile(
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
                    new RemoteUri(testDirPath),
                    "IPYNB"
                );

                const wrapperData = await getWrapperData();
                const expected = {
                    ...notebookMetadata,
                    cells: [
                        {
                            ...wrapperData,
                            source: [
                                [
                                    "import os",
                                    `os.chdir(os.path.dirname('${
                                        new RemoteUri(originalFilePath)
                                            .workspacePrefixPath
                                    }'))`,
                                    "%pip install x",
                                ].join("\n"),
                            ],
                        },
                        {
                            ...wrapperData,
                            source: ["dbutils.library.restartPython()"],
                        },
                        wrapperData,
                        {...cellMetadata, source: ["print('hello')"]},
                        {...cellMetadata, source: ["print('hello2')"]},
                    ],
                };

                verifyMockServiceCalledWithExpectedData(
                    JSON.stringify(expected),
                    wrappedFilePath
                );
            });
        });
    });
});
