import * as vscode from "vscode";
import {
    TestSuiteInfo,
    TestInfo,
    TestRunStartedEvent,
    TestRunFinishedEvent,
    TestSuiteEvent,
    TestEvent,
} from "vscode-test-adapter-api";

const fakeTestSuite: TestSuiteInfo = {
    type: "suite",
    id: "root",
    label: "Fake", // the label of the root node should be the name of the testing framework
    children: [
        {
            type: "suite",
            id: "nested",
            label: "Nested suite",
            children: [
                {
                    type: "test",
                    id: "test1",
                    label: "Test #1",
                },
                {
                    type: "test",
                    id: "test2",
                    label: "Test #2",
                },
            ],
        },
        {
            type: "test",
            id: "test3",
            label: "Test #3",
        },
        {
            type: "test",
            id: "test4",
            label: "Test #4",
        },
    ],
};

export function loadFakeTests(): Promise<TestSuiteInfo> {
    return Promise.resolve<TestSuiteInfo>(fakeTestSuite);
}

export async function runFakeTests(
    tests: string[],
    testStatesEmitter: vscode.EventEmitter<
        TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent
    >
): Promise<void> {
    for (const suiteOrTestId of tests) {
        const node = findNode(fakeTestSuite, suiteOrTestId);
        if (node) {
            await runNode(node, testStatesEmitter);
        }
    }
}

function findNode(
    searchNode: TestSuiteInfo | TestInfo,
    id: string
): TestSuiteInfo | TestInfo | undefined {
    if (searchNode.id === id) {
        return searchNode;
    } else if (searchNode.type === "suite") {
        for (const child of searchNode.children) {
            const found = findNode(child, id);
            if (found) return found;
        }
    }
    return undefined;
}

async function runNode(
    node: TestSuiteInfo | TestInfo,
    testStatesEmitter: vscode.EventEmitter<
        TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent
    >
): Promise<void> {
    if (node.type === "suite") {
        testStatesEmitter.fire(<TestSuiteEvent>{
            type: "suite",
            suite: node.id,
            state: "running",
        });

        for (const child of node.children) {
            await runNode(child, testStatesEmitter);
        }

        testStatesEmitter.fire(<TestSuiteEvent>{
            type: "suite",
            suite: node.id,
            state: "completed",
        });
    } else {
        // node.type === 'test'

        testStatesEmitter.fire(<TestEvent>{
            type: "test",
            test: node.id,
            state: "running",
        });

        testStatesEmitter.fire(<TestEvent>{
            type: "test",
            test: node.id,
            state: "passed",
        });
    }
}
