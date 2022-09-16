import {randomUUID} from "crypto";
import * as vscode from "vscode";
import {
    TestAdapter,
    TestLoadStartedEvent,
    TestLoadFinishedEvent,
    TestRunStartedEvent,
    TestRunFinishedEvent,
    TestSuiteEvent,
    TestEvent,
} from "vscode-test-adapter-api";
import {Log} from "vscode-test-adapter-util";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {DatabricksRuntime} from "../run/DabaricksRuntime";
import {loadFakeTests, runFakeTests} from "./fakeTests";
import {parseCollectedTests} from "./pytestParser";

/**
 * This class is intended as a starting point for implementing a "real" TestAdapter.
 * The file `README.md` contains further instructions.
 */
export class PytestAdapter implements TestAdapter {
    private disposables: {dispose(): void}[] = [];

    private readonly testsEmitter = new vscode.EventEmitter<
        TestLoadStartedEvent | TestLoadFinishedEvent
    >();
    private readonly testStatesEmitter = new vscode.EventEmitter<
        TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent
    >();
    private readonly autorunEmitter = new vscode.EventEmitter<void>();

    private runningTests: Map<String, Boolean> = new Map();
    private errored = false;
    private errorChannel: vscode.OutputChannel;

    get tests(): vscode.Event<TestLoadStartedEvent | TestLoadFinishedEvent> {
        return this.testsEmitter.event;
    }
    get testStates(): vscode.Event<
        TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent
    > {
        return this.testStatesEmitter.event;
    }
    get autorun(): vscode.Event<void> | undefined {
        return this.autorunEmitter.event;
    }

    constructor(
        private readonly connectionManager: ConnectionManager,
        public readonly workspace: vscode.WorkspaceFolder,
        private readonly log: Log
    ) {
        this.log.info("Initializing example adapter");
        this.connectionManager.onDidChangeState((state) => {
            if (state === "CONNECTED") {
                this.load();
            }
        });
        this.errorChannel = vscode.window.createOutputChannel("Pytest Errors");
        this.disposables.push(this.testsEmitter);
        this.disposables.push(this.testStatesEmitter);
        this.disposables.push(this.autorunEmitter);
    }

    async load(): Promise<void> {
        await this.connectionManager.waitForConnect();
        if (this.connectionManager.syncDestination === undefined) {
            return;
        }

        this.log.info("Loading tests");

        this.testsEmitter.fire(<TestLoadStartedEvent>{type: "started"});

        const code = [
            `import pytest`,
            `import tempfile`,
            `import os`,

            `dir = "${this.connectionManager.syncDestination?.remotePath}"`,
            `tfile = tempfile.NamedTemporaryFile(dir = dir, prefix="pytest-hack", delete=False)`,
            `tfile.close()`,

            `import sys`,
            `sys.path.append(dir)`,
            `from Plugins import Plugin`,
            `pytest.main(["--collect-only", "--no-summary", "-qq", "--collect-output-file", tfile.name, "-o", "console_output_style=classic", dir], [Plugin])`,

            `with open(tfile.name, "r") as fil:`,
            `  print("===start collect output===")`,
            `  print(fil.read())`,
            `  print("===end collect output===")`,
        ];
        const databricksRuntime = await new DatabricksRuntime(
            this.connectionManager
        );
        databricksRuntime.onDidSendOutput((e) => {
            if (e.text.includes("===start collect output===")) {
                this.testsEmitter.fire(<TestLoadFinishedEvent>{
                    type: "finished",
                    suite: parseCollectedTests(e.text),
                });
            }
        });

        databricksRuntime.start("Collect tests", code.join("\n"), code.length);
    }

    async runSingleTest(testfile: string, testName: string, id: string) {
        await this.connectionManager.waitForConnect();
        if (this.connectionManager.syncDestination === undefined) {
            return;
        }
        this.log.info(`Running test ${testfile}::${testName}`);

        this.testStatesEmitter.fire(<TestEvent>{
            type: "test",
            test: id,
            state: "running",
            testRunId: id,
        });

        const code = [
            `import pytest`,
            `import os`,
            `dir = "${this.connectionManager.syncDestination?.remotePath}"`,
            `os.chdir(dir)`,

            `import sys`,
            `sys.path.append(dir)`,

            `print("===test output===", pytest.main(["-o", "console_output_style=classic", "${testfile}", "-k", "${testName}"]))`,
        ];

        const databricksRuntime = new DatabricksRuntime(this.connectionManager);
        let state: TestEvent["state"];

        databricksRuntime.onDidSendOutput((e) => {
            if (e.text.includes("===test output===")) {
                const content = e.text.slice(
                    e.text.indexOf("===test output===")
                );

                const codeToState: [string, TestEvent["state"]][] = [
                    ["ExitCode.OK", "passed"],
                    ["ExitCode.TESTS_FAILED", "failed"],
                    ["ExitCode.INTERRUPTED", "errored"],
                    ["ExitCode.INTERNAL_ERROR", "errored"],
                    ["ExitCode.USAGE_ERROR", "errored"],
                    ["ExitCode.NO_TESTS_COLLECTED", "skipped"],
                ];

                state = codeToState.find(([code, _]) =>
                    content.includes(code)
                )![1];

                if (!["passed", "skipped"].includes(state)) {
                    this.log.error(
                        e.text.slice(0, e.text.indexOf("===test output==="))
                    );
                    this.errorChannel.appendLine(
                        e.text.slice(0, e.text.indexOf("===test output==="))
                    );
                    this.errored = true;
                }
            }
        });

        databricksRuntime.onDidEnd((e) => {
            this.runningTests.set(id, false);
            this.testStatesEmitter.fire(<TestEvent>{
                type: "test",
                state: state,
                test: id,
                testRunId: id,
            });
            this.log.info(`Finished test ${testfile}::${testName}`);
        });

        databricksRuntime.start("Run test", code.join("\n"), code.length);
    }

    async run(testIds: string[]): Promise<void> {
        if (testIds.includes("root")) {
            vscode.window.showErrorMessage("Please select a suite to run");
            return;
        }

        this.errorChannel.clear();
        this.log.info(`Running tests ${JSON.stringify(testIds)}`);

        const testRunId = randomUUID();
        this.testStatesEmitter.fire(<TestRunStartedEvent>{
            type: "started",
            tests: testIds,
            testRunId,
        });

        testIds.forEach((testId) => {
            if (testId.split("::").length > 2) {
                const components = testId.split("::");
                const singleTestIds = components
                    .slice(1)
                    .map((singleTest) => `${components[0]}::${singleTest}`);

                this.runningTests.set(testId, true);
                this.testStatesEmitter.fire(<TestSuiteEvent>{
                    type: "suite",
                    testRunId: testId,
                    suite: testId,
                    state: "running",
                });
                singleTestIds.forEach((testId) => {
                    const [testPath, testName] = testId.split("::");
                    this.runSingleTest(testPath, testName, testId);
                    this.runningTests.set(testId, true);
                });

                let completed = false;
                this.testStates((e) => {
                    if (completed) {
                        return;
                    }

                    if (
                        singleTestIds.find((testId) =>
                            this.runningTests.get(testId)
                        ) === undefined
                    ) {
                        completed = true;
                        this.runningTests.set(testId, false);
                        this.testStatesEmitter.fire(<TestSuiteEvent>{
                            type: "suite",
                            testRunId: testId,
                            suite: testId,
                            state: "completed",
                        });
                    }
                });
            } else {
                const [testPath, testName] = testId.split("::");
                this.runSingleTest(testPath, testName, testId);
                this.runningTests.set(testId, true);
            }
        });

        let completed: boolean = false;

        this.testStates((e) => {
            if (completed) {
                return;
            }
            if (
                testIds.find((testId) => this.runningTests.get(testId)) ===
                undefined
            ) {
                completed = true;
                if (this.errored) {
                    console.log("errored");
                    this.errorChannel.show();
                }
                this.testStatesEmitter.fire(<TestRunFinishedEvent>{
                    type: "finished",
                    testRunId,
                });
            }
        });
    }

    /*	implement this method if your TestAdapter supports debugging tests
	async debug(tests: string[]): Promise<void> {
		// start a test run in a child process and attach the debugger to it...
	}
*/

    cancel(): void {
        // in a "real" TestAdapter this would kill the child process for the current test run (if there is any)
        throw new Error("Method not implemented.");
    }

    dispose(): void {
        this.cancel();
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}
