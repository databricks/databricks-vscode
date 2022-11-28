/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {mock, when, instance, anything, verify, capture} from "ts-mockito";
import {Disposable, Uri} from "vscode";
import {
    Cluster,
    Command,
    ExecutionContext,
    Repo,
} from "@databricks/databricks-sdk";
import {
    DatabricksRuntime,
    FileAccessor,
    OutputEvent,
} from "./DatabricksRuntime";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {SyncDestination} from "../configuration/SyncDestination";
import {CodeSynchronizer} from "../sync/CodeSynchronizer";

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

        const fileAccessor: FileAccessor = {
            async readFile(): Promise<string> {
                return "print('43')";
            },
        };

        const connectionManager = instance<ConnectionManager>(
            connectionManagerMock
        );

        runtime = new DatabricksRuntime(
            connectionManager,
            fileAccessor,
            mock(CodeSynchronizer)
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

    it("should have the right code with env vars", async () => {
        await runtime.start("/Desktop/workspaces/hello.py", [], {TEST: "TEST"});

        const code = capture(executionContextMock.execute).first()[0];
        assert.equal(
            code,
            `import os; os.chdir("/Workspace/Repos/fabian@databricks.com/test");
import sys; sys.path.append("/Workspace/Repos/fabian@databricks.com/test")
import sys; sys.argv = ['/Workspace/Repos/fabian@databricks.com/test/hello.py'];
import os; os.environ["TEST"]='TEST';
import logging; logger = spark._jvm.org.apache.log4j; logging.getLogger("py4j.java_gateway").setLevel(logging.ERROR)
print('43')`
        );
    });

    it("should have the right code without env vars", async () => {
        await runtime.start("/Desktop/workspaces/hello.py", [], {});

        const code = capture(executionContextMock.execute).first()[0];
        assert.equal(
            code,
            `import os; os.chdir("/Workspace/Repos/fabian@databricks.com/test");
import sys; sys.path.append("/Workspace/Repos/fabian@databricks.com/test")
import sys; sys.argv = ['/Workspace/Repos/fabian@databricks.com/test/hello.py'];

import logging; logger = spark._jvm.org.apache.log4j; logging.getLogger("py4j.java_gateway").setLevel(logging.ERROR)
print('43')`
        );
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
