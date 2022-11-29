/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {mock, when, instance, anything, verify, capture} from "ts-mockito";
import {Disposable, ExtensionContext, Uri} from "vscode";
import {
    Cluster,
    Command,
    ExecutionContext,
    Repo,
} from "@databricks/databricks-sdk";
import {DatabricksRuntime, OutputEvent} from "./DatabricksRuntime";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {SyncDestination} from "../configuration/SyncDestination";
import {CodeSynchronizer} from "../sync/CodeSynchronizer";
import path from "node:path";

describe(__filename, () => {
    let disposables: Array<Disposable>;
    let runtime: DatabricksRuntime;
    let executionContextMock: ExecutionContext;
    let connectionManagerMock: ConnectionManager;

    beforeEach(async () => {
        disposables = [];

        connectionManagerMock = mock(ConnectionManager);
        when(connectionManagerMock.state).thenReturn("CONNECTING");

        executionContextMock = mock(ExecutionContext);
        when(
            executionContextMock.execute(anything(), anything(), anything())
        ).thenResolve({
            cmd: mock(Command),
            result: {
                id: "123",
                status: "Finished",
                results: {
                    resultType: "text",
                    data: "43",
                },
            },
        });
        const executionContext = instance(executionContextMock);

        const cluster = mock(Cluster);
        when(cluster.createExecutionContext(anything())).thenResolve(
            executionContext
        );
        when(cluster.id).thenReturn("cluster-1");
        when(cluster.state).thenReturn("RUNNING");
        when(connectionManagerMock.cluster).thenReturn(
            instance<Cluster>(cluster)
        );

        const syncDestination = new SyncDestination(
            instance(mock(Repo)),
            Uri.from({
                scheme: "wsfs",
                path: "/Workspace/Repos/fabian@databricks.com/test",
            }),
            Uri.file("/Desktop/workspaces")
        );
        when(connectionManagerMock.syncDestination).thenReturn(syncDestination);

        const connectionManager = instance<ConnectionManager>(
            connectionManagerMock
        );

        const extensionContextMock = mock<ExtensionContext>();
        when(extensionContextMock.extensionUri).thenReturn(
            Uri.file(path.join(__dirname, "..", ".."))
        );

        runtime = new DatabricksRuntime(
            connectionManager,
            mock(CodeSynchronizer),
            instance(extensionContextMock)
        );
    });

    afterEach(() => {
        disposables.forEach((d) => d.dispose());
    });

    it("run a file", async () => {
        const outputs: Array<OutputEvent> = [];
        disposables.push(
            runtime.onError((e) => {
                console.error(e);
                assert(false);
            }),
            runtime.onDidSendOutput((o) => {
                outputs.push(o);
            })
        );

        await runtime.start("/Desktop/workspaces/hello.py", [], {});

        verify(connectionManagerMock.waitForConnect()).called();
        assert.equal(outputs.length, 6);
        assert(outputs[0].text.includes("Connecting to cluster"));
        assert(
            outputs[1].text.includes("Creating execution context on cluster")
        );
        assert(outputs[2].text.includes("Synchronizing code to"));
        assert(outputs[3].text.includes("Running /hello.py"));
        assert.equal(outputs[4].text, "43");
        assert(outputs[5].text.includes("Done"));
    });

    it("should inject environment variables", async () => {
        await runtime.start("/Desktop/workspaces/hello.py", [], {TEST: "TEST"});

        const code = capture(executionContextMock.execute).first()[0];
        assert(code.includes(`env = {"TEST":"TEST"}`));
    });

    it("should have the right code without env vars", async () => {
        await runtime.start("/Desktop/workspaces/hello.py", [], {});

        const code = capture(executionContextMock.execute).first()[0];
        assert(code.includes(`env = {}`));
    });

    it("should handle failed executions", async () => {
        when(
            executionContextMock.execute(anything(), anything(), anything())
        ).thenResolve({
            cmd: mock(Command),
            result: {
                id: "123",
                status: "Finished",
                results: {
                    resultType: "error",
                    summary: "summary",
                    cause: "something went wrong",
                },
            },
        });

        const outputs: Array<OutputEvent> = [];
        disposables.push(
            runtime.onError((e) => {
                console.error(e);
                assert(false);
            }),
            runtime.onDidSendOutput((o) => {
                outputs.push(o);
            })
        );

        await runtime.start("/Desktop/workspaces/hello.py", [], {});

        assert.equal(outputs.length, 7);
        assert.equal(outputs[4].text, "something went wrong");
        assert.equal(outputs[5].text, "summary");
    });
});
