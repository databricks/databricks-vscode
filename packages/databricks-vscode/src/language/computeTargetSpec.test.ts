import * as assert from "assert";
import {getRequiredPythonVersion} from "./computeTargetSpec";

describe(__filename, () => {
    describe("serverless", () => {
        it("should require python 3.12 exactly for serverless 17.3", () => {
            const required = getRequiredPythonVersion({
                serverless: true,
                serverlessDbconnectVersion: "17.3",
            });
            assert.deepStrictEqual(required, {
                major: 3,
                minor: 12,
                exact: true,
                display: "3.12",
                source: "the serverless environment",
            });
        });

        it("should require python 3.12 exactly for serverless 16.4", () => {
            const required = getRequiredPythonVersion({
                serverless: true,
                serverlessDbconnectVersion: "16.4",
            });
            assert.strictEqual(required?.display, "3.12");
            assert.strictEqual(required?.exact, true);
        });

        it("should require python 3.11 exactly for serverless 15.4", () => {
            const required = getRequiredPythonVersion({
                serverless: true,
                serverlessDbconnectVersion: "15.4",
            });
            assert.strictEqual(required?.display, "3.11");
            assert.strictEqual(required?.exact, true);
        });

        it("should return undefined for an unparsable serverless version", () => {
            const required = getRequiredPythonVersion({
                serverless: true,
                serverlessDbconnectVersion: "latest",
            });
            assert.strictEqual(required, undefined);
        });
    });

    describe("clusters", () => {
        const cases: Array<{dbr: (number | "x")[]; display?: string}> = [
            {dbr: [13, 3], display: "3.10"},
            {dbr: [14, 3], display: "3.10"},
            {dbr: [15, 4], display: "3.11"},
            {dbr: [16, 4], display: "3.12"},
            {dbr: [17, 0], display: "3.12"},
            {dbr: [15, "x"], display: "3.11"},
            {dbr: ["x", "x"], display: undefined},
            {dbr: [12, 2], display: undefined},
        ];
        for (const {dbr, display} of cases) {
            it(`should require python ${display} for DBR ${dbr.join(
                "."
            )}`, () => {
                const required = getRequiredPythonVersion({
                    serverless: false,
                    serverlessDbconnectVersion: "17.3",
                    dbrVersion: dbr,
                });
                assert.strictEqual(required?.display, display);
                if (required) {
                    assert.strictEqual(required.exact, false);
                    assert.strictEqual(required.source, `DBR ${dbr[0]}`);
                }
            });
        }

        it("should return undefined without a cluster", () => {
            const required = getRequiredPythonVersion({
                serverless: false,
                serverlessDbconnectVersion: "17.3",
            });
            assert.strictEqual(required, undefined);
        });
    });
});
