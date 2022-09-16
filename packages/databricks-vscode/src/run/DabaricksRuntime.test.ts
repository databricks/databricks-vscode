/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {mock, when, instance, anything, verify, capture} from "ts-mockito";
import {Disposable, Uri} from "vscode";
import {Cluster, Command, ExecutionContext} from "@databricks/databricks-sdk";
import {DatabricksRuntime, FileAccessor, OutputEvent} from "./DabaricksRuntime";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {SyncDestination} from "../configuration/SyncDestination";

describe(__filename, () => {
    let disposables: Array<Disposable>;
    let runtime: DatabricksRuntime;
    let executionContextMock: ExecutionContext;
    let connectionManagerMock: ConnectionManager;

    beforeEach(() => {
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
        when(connectionManagerMock.cluster).thenReturn(
            instance<Cluster>(cluster)
        );

        const syncDestination = new SyncDestination(
            Uri.from({
                scheme: "dbws",
                path: "/Repos/fabian@databricks.com/test",
            }),
            Uri.file("/Desktop/workspaces")
        );
        when(connectionManagerMock.syncDestination).thenReturn(syncDestination);

        const fileAccessor: FileAccessor = {
            async readFile(name: string): Promise<string> {
                return "print('43')";
            },
        };

        const connectionManager = instance<ConnectionManager>(
            connectionManagerMock
        );

        runtime = new DatabricksRuntime(connectionManager, fileAccessor);
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

        await runtime.startFromFile("/Desktop/workspaces/hello.py", []);

        verify(connectionManagerMock.waitForConnect()).called();

        assert.equal(outputs.length, 4);
        assert(outputs[0].text.includes("Connecting to cluster"));
        assert(
            outputs[1].text.includes("Running /hello.py on Cluster cluster-1")
        );
        assert.equal(outputs[2].text, "43");
        assert(outputs[3].text.includes("Done"));
    });

    it("should have the right code", async () => {
        await runtime.startFromFile("/Desktop/workspaces/hello.py", []);

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

    it("should return handle failed executions", async () => {
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

        await runtime.startFromFile("/Desktop/workspaces/hello.py", []);

        assert.equal(outputs.length, 5);
        assert.equal(outputs[2].text, "something went wrong");
        assert.equal(outputs[3].text, "summary");
    });
});
