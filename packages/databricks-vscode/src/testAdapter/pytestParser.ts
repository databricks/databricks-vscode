import path from "path";
import {TestInfo, TestSuiteInfo} from "vscode-test-adapter-api";

const DISCOVERED_TESTS_START_MARK = "===start collect output===";
const DISCOVERED_TESTS_END_MARK = "===end collect output===";

interface RawTest {
    type: "path" | "pytest_unit";
    title: string;
    children: RawTest[];
}
export function parseCollectedTests(content: string): TestSuiteInfo {
    const start =
        content.indexOf(DISCOVERED_TESTS_START_MARK) +
        DISCOVERED_TESTS_START_MARK.length;
    const end = content.indexOf(DISCOVERED_TESTS_END_MARK);

    const json: RawTest[] = JSON.parse(
        Buffer.from(content.slice(start, end), "base64").toString("utf-8")
    ) as RawTest[];

    const tests = new Map<string, string[]>();

    const flatTests = json.flatMap((child) => rec(child));
    flatTests.forEach((test) => {
        const testPath = path.join(...test.slice(0, -1));
        if (tests.has(testPath)) {
            tests.get(testPath)!.push(test[test.length - 1]);
        } else {
            tests.set(testPath, [test[test.length - 1]]);
        }
    });

    return {
        id: "root",
        label: "Pytest on Databricks",
        type: "suite",
        children: Array.from(tests.entries()).map(([testPath, tests]) => {
            return {
                type: "suite",
                id: [testPath, ...tests].join("::"),
                label: path.basename(testPath),
                children: tests.map<TestInfo>((test) => {
                    return {
                        id: `${testPath}::${test}`,
                        label: test,
                        type: "test",
                    };
                }),
            };
        }),
    };
}

function rec(json: RawTest): string[][] {
    if (json.type === "pytest_unit") {
        return [[json.title]];
    }

    return json.children.flatMap((child) => {
        return rec(child).map((value) => [json.title, ...value]);
    });
}
