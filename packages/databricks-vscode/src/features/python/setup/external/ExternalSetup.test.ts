import { describe, expect, it } from "vitest";
import { UserFacingError } from "../../../../platform/errors";
import type { Environment } from "../../msPythonApi";
import type { Readiness, ReadinessCheck } from "../readiness";
import type { ChecklistCompute } from "./checks";
import type { DbConnectInstaller } from "./DbConnectInstaller";
import {
    CREATE_NEW_ENVIRONMENT_LABEL,
    environmentName,
    ExternalSetup,
    USE_PYTHON_EXTENSION_LABEL,
    type EnvironmentPick,
} from "./ExternalSetup";

const VENV = "/project/.venv/bin/python";

const interpreterMissing: ReadinessCheck = {
    id: "checkPythonEnvironment",
    available: false,
    title: "Activate an environment with Python 3.12",
    message: "Databricks Connect requires Python 3.12. No active environments found.",
    action: "selectInterpreter",
};
const interpreterOk: ReadinessCheck = {
    id: "checkPythonEnvironment",
    available: true,
    title: "Active Environment: .venv",
    message: VENV,
};
const noInterpreterForDeps: ReadinessCheck = {
    id: "checkEnvironmentDependencies",
    available: false,
    title: "Can't install databricks-connect without an active python environment",
};
const dbConnectMissing: ReadinessCheck = {
    id: "checkEnvironmentDependencies",
    available: false,
    title: "Install databricks-connect",
    message: "databricks-connect package is not installed in the current environment.",
    action: "installDbConnect",
};
const dbConnectOk: ReadinessCheck = {
    id: "checkEnvironmentDependencies",
    available: true,
    title: "Databricks Connect: 17.3.1",
};
const clusterMissing: ReadinessCheck = {
    id: "checkCluster",
    available: false,
    title: "Attach a cluster",
    action: "attachCluster",
    actionMessage: "Please attach a cluster to use Databricks Connect.",
};

function readiness(
    checks: ReadinessCheck[],
    interpreter?: string,
    strategy: Readiness["strategy"] = "external",
): Readiness {
    return {
        strategy,
        status: checks.every((c) => c.available || c.optional) ? "ready" : "notReady",
        interpreter: interpreter === undefined ? undefined : { path: interpreter, name: ".venv" },
        checks,
    };
}

function external(options: {
    states: Readiness[];
    environments?: Environment[];
    pick?: (items: EnvironmentPick[]) => EnvironmentPick | undefined;
    compute?: ChecklistCompute;
    /** ms-python is missing or disabled. */
    noPython?: boolean;
}) {
    const states = [...options.states];
    const log: string[] = [];
    const infos: string[] = [];
    let current: Readiness | undefined = states[0];
    const setup = new ExternalSetup({
        readiness: () => current,
        refresh: async (progress) => {
            log.push(progress ? "refresh with progress" : "refresh");
            states.shift();
            current = states[0] ?? current;
            return current;
        },
        python: {
            availableEnvironments: async () => options.environments ?? [],
            createEnvironment: async () => void log.push("createEnvironment"),
            selectInterpreter: async () => void log.push("python.setInterpreter"),
            setActiveEnvironmentPath: async (p) => void log.push(`select ${p}`),
        },
        requireExtension: (extension, what) => {
            if (options.noPython) {
                throw new UserFacingError("EXTENSION_MISSING", `${what} needs ${extension.id}`);
            }
        },
        installer: {
            show: async (advertisement?: boolean) =>
                void log.push(`install prompt${advertisement ? " (advertisement)" : ""}`),
            installWithVersionPrompt: async (placeholder?: string) =>
                void log.push(`reinstall ${placeholder}`),
        } as unknown as DbConnectInstaller,
        compute: () => options.compute ?? { kind: "serverless", dbConnectVersion: "17.3" },
        attachCluster: async (message) => void log.push(`attachCluster: ${message}`),
        configureAutocomplete: async () => void log.push("configureAutocomplete"),
        ui: {
            showInformationMessage: async (m) => void infos.push(m),
            showQuickPick: async (items) => {
                log.push(`pick from ${items.map((i) => i.label).join(", ")}`);
                return options.pick?.(items);
            },
        },
    });
    return { setup, log, infos };
}

describe("ExternalSetup.setup", () => {
    it("takes the first failing row's action, checks again with progress, and reports success", async () => {
        const { setup, log, infos } = external({
            states: [
                readiness([clusterMissing, interpreterOk, dbConnectOk], VENV),
                readiness([interpreterOk, dbConnectOk], VENV),
            ],
        });
        await setup.setup();
        expect(log).toEqual([
            "attachCluster: Please attach a cluster to use Databricks Connect.",
            "refresh with progress",
        ]);
        expect(infos).toEqual(["Python environment and Databricks Connect are set up."]);
    });

    it("offers the optional builtins when only they are missing, and reports success (PYENV-09)", async () => {
        const builtins = {
            id: "checkBuiltins",
            available: false,
            optional: true,
            title: "Setup Databricks builtins for autocompletion",
            action: "configureAutocomplete" as const,
        };
        const { setup, log, infos } = external({
            states: [
                readiness([interpreterOk, dbConnectOk, builtins], VENV),
                readiness([interpreterOk, dbConnectOk], VENV),
            ],
        });
        await setup.setup("checkBuiltins");
        expect(log).toEqual(["configureAutocomplete", "refresh with progress"]);
        expect(infos).toEqual(["Python environment and Databricks Connect are set up."]);
    });

    it("takes the action of the row it was clicked on", async () => {
        const { setup, log } = external({
            states: [
                readiness([clusterMissing, interpreterOk, dbConnectMissing], VENV),
                readiness([interpreterOk, dbConnectOk], VENV),
            ],
        });
        await setup.setup("checkEnvironmentDependencies");
        expect(log).toEqual(["install prompt", "refresh with progress"]);
    });

    it("stops after one action and reports what is still missing", async () => {
        const { setup, log } = external({
            states: [readiness([clusterMissing, interpreterMissing, noInterpreterForDeps])],
        });
        const error = await setup.setup().catch((e: unknown) => e);
        expect(error).toBeInstanceOf(UserFacingError);
        expect((error as UserFacingError).userMessage).toBe(
            "Failed to set up Python environment for Databricks Connect:\n" +
                "Attach a cluster\n" +
                "Databricks Connect requires Python 3.12. No active environments found.\n" +
                "Can't install databricks-connect without an active python environment",
        );
        expect(log).toEqual([
            "attachCluster: Please attach a cluster to use Databricks Connect.",
            "refresh with progress",
        ]);
    });

    it("reports success without an action when everything passes", async () => {
        const { setup, log, infos } = external({
            states: [readiness([interpreterOk, dbConnectOk], VENV)],
        });
        await setup.setup();
        expect(log).toEqual([]);
        expect(infos).toEqual(["Python environment and Databricks Connect are set up."]);
    });

    it("offers the install, not an error, once a selected interpreter only lacks Databricks Connect", async () => {
        const { setup, log } = external({
            states: [
                readiness([interpreterMissing, noInterpreterForDeps]),
                readiness([interpreterOk, dbConnectMissing], VENV),
            ],
        });
        await setup.setup();
        expect(log).toEqual(["createEnvironment", "refresh with progress", "install prompt"]);
    });

    it("doesn't offer it twice for one interpreter, when the interpreter change already did", async () => {
        const after = readiness([interpreterOk, dbConnectMissing], VENV);
        const { setup, log } = external({
            states: [readiness([interpreterMissing, noInterpreterForDeps]), after],
        });
        await setup.offerInstall(after, true);
        await setup.setup();
        expect(log).toEqual([
            "install prompt (advertisement)",
            "createEnvironment",
            "refresh with progress",
        ]);
    });
});

describe("ExternalSetup.offerInstall (the old onInterpreterChanged)", () => {
    it("offers the install prompt when the external strategy is active", async () => {
        const state = readiness([interpreterOk, dbConnectMissing], VENV);
        const { setup, log } = external({ states: [state] });
        await setup.offerInstall(state, true);
        expect(log).toEqual(["install prompt (advertisement)"]);
    });

    it("suppresses it when the uv flow owns the project", async () => {
        const state = readiness([interpreterOk, dbConnectMissing], VENV, "uv");
        const { setup, log } = external({ states: [state] });
        await setup.offerInstall(state, true);
        expect(log).toEqual([]);
    });

    it("offers nothing when Databricks Connect is there, or there's no interpreter", async () => {
        const { setup, log } = external({ states: [] });
        await setup.offerInstall(readiness([interpreterOk, dbConnectOk], VENV), true);
        await setup.offerInstall(readiness([interpreterMissing, noInterpreterForDeps]), true);
        expect(log).toEqual([]);
    });

    it("offers again for another interpreter", async () => {
        const { setup, log } = external({ states: [] });
        await setup.offerInstall(readiness([interpreterOk, dbConnectMissing], VENV), true);
        await setup.offerInstall(readiness([interpreterOk, dbConnectMissing], VENV), true);
        await setup.offerInstall(
            readiness([interpreterOk, dbConnectMissing], "/other/bin/python"),
            true,
        );
        expect(log).toEqual(["install prompt (advertisement)", "install prompt (advertisement)"]);
    });
});

const env = (path: string, name?: string): Environment =>
    ({
        id: path,
        path,
        version: { major: 3, minor: 12, micro: 4 },
        environment: name === undefined ? undefined : { name },
    }) as unknown as Environment;

describe("ExternalSetup.selectPythonInterpreter", () => {
    it("opens ms-python's create flow when there is nothing to pick", async () => {
        const { setup, log } = external({ states: [] });
        await setup.selectPythonInterpreter();
        expect(log).toEqual(["createEnvironment"]);
    });

    it("says it needs the Python extension, from the interpreter row too, and opens nothing", async () => {
        const { setup, log } = external({
            states: [readiness([interpreterMissing])],
            noPython: true,
        });
        await expect(setup.selectPythonInterpreter()).rejects.toThrow(
            "Selecting a Python interpreter needs ms-python.python",
        );
        await expect(setup.setup("checkPythonEnvironment")).rejects.toMatchObject({
            code: "EXTENSION_MISSING",
        });
        expect(log).toEqual([]);
    });

    it("lists the environments, then the create and ms-python entries", async () => {
        const { setup, log } = external({
            states: [],
            environments: [env(VENV, ".venv"), env("/conda/bin/python", "base")],
            pick: (items) => items[0],
        });
        await setup.selectPythonInterpreter();
        expect(log).toEqual([
            `pick from 3.12.4 .venv, 3.12.4 base, ${CREATE_NEW_ENVIRONMENT_LABEL}, ${USE_PYTHON_EXTENSION_LABEL}`,
            `select ${VENV}`,
        ]);
    });

    it("runs the create flow or ms-python's picker from the static entries", async () => {
        const create = external({
            states: [],
            environments: [env(VENV, ".venv")],
            pick: (items) => items.find((i) => i.label === CREATE_NEW_ENVIRONMENT_LABEL),
        });
        await create.setup.selectPythonInterpreter();
        expect(create.log.at(-1)).toBe("createEnvironment");
        const ms = external({
            states: [],
            environments: [env(VENV, ".venv")],
            pick: (items) => items.find((i) => i.label === USE_PYTHON_EXTENSION_LABEL),
        });
        await ms.setup.selectPythonInterpreter();
        expect(ms.log.at(-1)).toBe("python.setInterpreter");
    });

    it("names environments as before", () => {
        expect(environmentName(env(VENV, ".venv"))).toBe("3.12.4 .venv");
        expect(
            environmentName({ id: "x", path: "/usr/bin/python3" } as unknown as Environment),
        ).toBe("/usr/bin/python3");
    });
});

describe("ExternalSetup.reinstallDbConnect", () => {
    it("asks for the version, prefilled from the cluster's runtime", async () => {
        const { setup, log } = external({
            states: [readiness([interpreterOk, dbConnectOk], VENV)],
            compute: { kind: "cluster", dbrVersion: [15, 4, "x"], accessMode: "SHARED" },
        });
        await setup.reinstallDbConnect();
        expect(log).toEqual(["reinstall 15.4.*"]);
    });

    it("needs an active environment", async () => {
        const { setup } = external({
            states: [readiness([interpreterMissing, noInterpreterForDeps])],
        });
        await expect(setup.reinstallDbConnect()).rejects.toThrow(
            "Activate a python environment first.",
        );
    });

    it("says it needs the Python extension before asking for an environment", async () => {
        const { setup } = external({
            states: [readiness([interpreterMissing, noInterpreterForDeps])],
            noPython: true,
        });
        await expect(setup.reinstallDbConnect()).rejects.toThrow(
            "Reinstalling Databricks Connect needs ms-python.python",
        );
    });

    it("needs only an interpreter on the uv strategy", async () => {
        const { setup, log } = external({ states: [readiness([], VENV, "uv")] });
        await setup.reinstallDbConnect();
        expect(log).toEqual(["reinstall undefined"]);
    });
});
