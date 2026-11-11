import { describe, expect, it } from "vitest";
import {
    DatabricksDebugConfigurationProvider,
    type DatabricksPythonDebugConfiguration,
} from "./DatabricksDebugConfigurationProvider";

const BOOTSTRAP = "/extension/resources/python/dbconnect-bootstrap.py";
const VARIABLES = {
    DATABRICKS_CONFIG_PROFILE: "DEFAULT",
    DATABRICKS_SERVERLESS_COMPUTE_ID: "auto",
    DATABRICKS_TOKEN: "",
};

function resolve(
    configuration: DatabricksPythonDebugConfiguration,
    variables: Record<string, string> | undefined = VARIABLES,
) {
    const provider = new DatabricksDebugConfigurationProvider({
        bootstrapPath: BOOTSTRAP,
        variables: async () => variables,
    });
    return provider.resolveDebugConfigurationWithSubstitutedVariables(undefined, configuration);
}

describe("DatabricksDebugConfigurationProvider (RUN-06)", () => {
    it("runs databricks: true sessions through the bootstrap, with the program first", async () => {
        const resolved = await resolve({
            type: "debugpy",
            name: "x",
            request: "launch",
            databricks: true,
            program: "/project/a.py",
            args: ["--n", "1"],
        });
        expect(resolved).toMatchObject({
            program: BOOTSTRAP,
            args: ["/project/a.py", "--n", "1"],
            env: VARIABLES,
        });
    });

    it("gives ms-python's test sessions the variables, without the bootstrap", async () => {
        for (const configuration of [
            { type: "python", name: "x", request: "test" },
            {
                type: "debugpy",
                name: "Debug Unit Test",
                request: "launch",
                program: "/project/t.py",
            },
            {
                type: "debugpy",
                name: "x",
                request: "launch",
                program: "/project/t.py",
                env: { RUN_TEST_IDS_PORT: "1234" },
            },
        ]) {
            const resolved = await resolve({ ...configuration });
            expect(resolved.program).toBe(configuration.program);
            expect(resolved.env).toMatchObject(VARIABLES);
        }
    });

    it("lets the session's own env win", async () => {
        const resolved = await resolve({
            type: "debugpy",
            name: "x",
            request: "launch",
            databricks: true,
            program: "/a.py",
            env: { DATABRICKS_CONFIG_PROFILE: "OTHER", MINE: "1" },
        });
        expect(resolved.env).toEqual({
            ...VARIABLES,
            DATABRICKS_CONFIG_PROFILE: "OTHER",
            MINE: "1",
        });
    });

    it("adds only the Databricks variables, not the host's environment", async () => {
        const resolved = await resolve({
            type: "debugpy",
            name: "x",
            request: "launch",
            databricks: true,
            program: "/a.py",
        });
        expect(new Set(Object.keys(resolved.env ?? {}))).toEqual(new Set(Object.keys(VARIABLES)));
    });

    it("leaves other sessions untouched", async () => {
        const configuration = {
            type: "debugpy",
            name: "Python: Current File",
            request: "launch",
            program: "/a.py",
        };
        expect(await resolve({ ...configuration })).toEqual(configuration);
    });

    it("adds nothing without a session or a connection", async () => {
        const resolved = await resolve(
            { type: "debugpy", name: "x", request: "launch", databricks: true, program: "/a.py" },
            undefined,
        );
        expect(resolved).toMatchObject({ program: BOOTSTRAP, args: ["/a.py"], env: {} });
    });
});
