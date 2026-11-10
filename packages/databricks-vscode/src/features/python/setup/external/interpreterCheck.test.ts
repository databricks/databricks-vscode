import { describe, expect, it } from "vitest";
import { resolvedEnvironment } from "../../../../test-support/fakeMsPython";
import { checkPythonEnvironment } from "./interpreterCheck";

const env = (version: [number, number, number], options: { global?: boolean } = {}) =>
    resolvedEnvironment({ executable: "/p/.venv/bin/python", version, name: ".venv", ...options });
const cluster = (major: number | "x", minor: number | "x" = 4) =>
    ({ kind: "cluster", dbrVersion: [major, minor, "x"] }) as const;

// The old EnvironmentDependenciesVerifier.checkPythonEnvironment, its strings and version table.
describe("checkPythonEnvironment", () => {
    it("passes with the environment's name and interpreter path", () => {
        expect(checkPythonEnvironment(env([3, 11, 4]), cluster(15))).toEqual({
            id: "checkPythonEnvironment",
            available: true,
            title: "Active Environment: .venv",
            message: "/p/.venv/bin/python",
            warning: undefined,
        });
    });

    it("asks for an environment when there is none, or only a global interpreter", () => {
        for (const e of [undefined, env([3, 11, 4], { global: true })]) {
            expect(checkPythonEnvironment(e, cluster(15))).toEqual({
                id: "checkPythonEnvironment",
                available: false,
                title: "Activate an environment with Python 3.11",
                message: "Databricks Connect requires Python 3.11. No active environments found.",
                action: "selectInterpreter",
            });
        }
    });

    it("rejects a Python below 3.10", () => {
        const check = checkPythonEnvironment(env([3, 9, 1]), cluster(13));
        expect(check.available).toBe(false);
        expect(check.message).toBe(
            "Databricks Connect requires Python 3.10. Current Python version is 3.9.1.",
        );
    });

    it.each([
        [13, "3.10"],
        [14, "3.10"],
        [15, "3.11"],
        [16, "3.12"],
        [17, "3.12"],
        ["x", "3.10"],
    ] as const)("expects for DBR %s Python %s", (major, expected) => {
        expect(checkPythonEnvironment(undefined, cluster(major)).title).toBe(
            `Activate an environment with Python ${expected}`,
        );
    });

    it("asks for the Python extension without it, whatever the environment", () => {
        expect(checkPythonEnvironment(env([3, 11, 4]), cluster(15), false)).toEqual({
            id: "checkPythonEnvironment",
            available: false,
            title: "Install the Python extension",
            message:
                "Databricks Connect finds the Python interpreter through the Python extension (ms-python.python), which is missing or disabled.",
            action: "selectInterpreter",
        });
    });

    it("expects Python 3.10 without compute, as before", () => {
        expect(checkPythonEnvironment(undefined, undefined).title).toBe(
            "Activate an environment with Python 3.10",
        );
    });

    it("warns when the minor version doesn't match the cluster's runtime", () => {
        expect(checkPythonEnvironment(env([3, 12, 1]), cluster(15)).warning).toBe(
            "Use python 3.11 to match DBR 15 requirements. Current Python version is 3.12.1.",
        );
        expect(checkPythonEnvironment(env([3, 11, 1]), cluster(14)).warning).toBe(
            "Use python 3.10 to match DBR 14 requirements. Current Python version is 3.11.1.",
        );
        expect(checkPythonEnvironment(env([3, 11, 1]), cluster(16)).warning).toBe(
            "Use python 3.12 to match DBR 16 requirements. Current Python version is 3.11.1.",
        );
        expect(checkPythonEnvironment(env([3, 13, 1]), cluster(17)).warning).toBe(undefined);
    });

    it("reads the serverless Databricks Connect version: 16+ needs 3.12, below needs 3.11", () => {
        expect(
            checkPythonEnvironment(env([3, 11, 0]), {
                kind: "serverless",
                dbConnectVersion: "17.3",
            }).title,
        ).toBe("Activate an environment with Python 3.12");
        expect(
            checkPythonEnvironment(env([3, 10, 0]), {
                kind: "serverless",
                dbConnectVersion: "15.4",
            }).title,
        ).toBe("Activate an environment with Python 3.11");
        expect(
            checkPythonEnvironment(env([3, 11, 0]), {
                kind: "serverless",
                dbConnectVersion: "15.4",
            }).available,
        ).toBe(true);
    });

    it("asks for an interpreter when the environment has no executable", () => {
        const e = {
            ...env([3, 11, 4]),
            executable: { uri: undefined, bitness: "64-bit", sysPrefix: "/p" },
        } as never;
        expect(checkPythonEnvironment(e, cluster(15)).message).toBe("No Python executable found.");
    });
});
