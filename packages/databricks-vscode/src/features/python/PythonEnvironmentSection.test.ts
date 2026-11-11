import { describe, expect, it } from "vitest";
import { ThemeColor, ThemeIcon } from "vscode";
import type { ConfigurationItem } from "../../platform/ui/sections";
import { CLUSTER_CHECK_ID } from "./setup/external/checks";
import type { ReadinessCheck } from "./setup/readiness";
import {
    buildPythonSetupEntry,
    ENVIRONMENT_GROUP_ID,
    PYTHON_SETUP_ENTRY_ID,
    PythonEnvironmentSection,
    type EnvironmentCommands,
} from "./PythonEnvironmentSection";
import type { Readiness } from "./setup/readiness";

const ENVIRONMENT_ROOT = { id: ENVIRONMENT_GROUP_ID } as ConfigurationItem;
const COMMANDS = {
    setup: "databricks.environment.setupPythonEnv",
    rerun: "databricks.environment.rerunPythonEnv",
};

/** The legacy checklist: one not-yet-satisfied step. */
const EXTERNAL: Readiness = {
    strategy: "external",
    status: "notReady",
    checks: [{ id: "install", available: false, title: "Install deps" }],
};
const UV: Readiness = { strategy: "uv", status: "notReady", checks: [] };

function make(
    readiness: Readiness | undefined,
    options: { visible?: boolean; commands?: EnvironmentCommands } = {},
) {
    return new PythonEnvironmentSection({
        visible: () => options.visible ?? true,
        readiness: () => readiness,
        commands: options.commands ?? {},
    });
}

// Ported from EnvironmentComponent.test.ts: which surface shows.
describe("PythonEnvironmentSection dispatch", () => {
    it("shows the legacy checklist for the external strategy", () => {
        const children = make(EXTERNAL).getChildren(ENVIRONMENT_ROOT);

        expect(children).to.have.length(1);
        expect(children[0].label).to.equal("Install deps");
        expect(children.map((c) => c.id)).to.not.include(PYTHON_SETUP_ENTRY_ID);
    });

    it("shows the Python Environment group at the top level for the external strategy", () => {
        const root = make(EXTERNAL).getChildren();

        expect(root).to.have.length(1);
        expect(root[0].id).to.equal(ENVIRONMENT_GROUP_ID);
        expect(root[0].label).to.equal("Python Environment");
    });

    it("keeps the group calm when only the compute check is missing, and red when an environment check is", () => {
        const compute: ReadinessCheck = {
            id: CLUSTER_CHECK_ID,
            available: false,
            title: "Attach a cluster",
            action: "attachCluster",
        };
        const dbConnect: ReadinessCheck = {
            id: "checkDbConnect",
            available: false,
            title: "Databricks Connect: missing",
        };
        const group = (checks: ReadinessCheck[]) =>
            make({ ...EXTERNAL, checks }).getChildren()[0].iconPath as ThemeIcon;
        expect(group([compute]).color).to.equal(undefined);
        expect(group([compute, dbConnect]).color).to.deep.equal(new ThemeColor("errorForeground"));
    });

    it("renders a missing compute check's row calm, and an environment check's row red", () => {
        const [computeRow] = make({
            ...EXTERNAL,
            checks: [
                {
                    id: CLUSTER_CHECK_ID,
                    available: false,
                    title: "Attach a cluster",
                    action: "attachCluster",
                },
            ],
        }).getChildren(ENVIRONMENT_ROOT);
        expect((computeRow.iconPath as ThemeIcon).color).to.equal(undefined);
        const [envRow] = make({
            ...EXTERNAL,
            checks: [
                {
                    id: "checkDbConnect",
                    available: false,
                    title: "Install",
                    action: "installDbConnect",
                },
            ],
        }).getChildren(ENVIRONMENT_ROOT);
        expect((envRow.iconPath as ThemeIcon).color).to.deep.equal(
            new ThemeColor("errorForeground"),
        );
    });

    it("promotes the uv entry to the top level for the uv strategy", () => {
        const section = make(UV);

        // The top-level row is the uv entry itself, not a "Python Environment"
        // group wrapping it.
        const root = section.getChildren();
        expect(root).to.have.length(1);
        expect(root[0].id).to.equal(PYTHON_SETUP_ENTRY_ID);
        expect(root[0].label).to.equal("Set up Python environment");

        // Being a leaf, it has no children — so the checklist never renders.
        expect(section.getChildren(root[0])).to.have.length(0);
        expect(section.getChildren(ENVIRONMENT_ROOT)).to.have.length(0);
    });

    it("shows nothing until the strategy is known", () => {
        expect(make(undefined).getChildren()).to.deep.equal([]);
    });

    it("shows nothing when hidden (signed out, or not a development target)", () => {
        expect(make(EXTERNAL, { visible: false }).getChildren()).to.deep.equal([]);
        expect(make(EXTERNAL, { visible: false }).getChildren(ENVIRONMENT_ROOT)).to.deep.equal([]);
    });

    it("marks the group with its readiness, as the refresh menu expects", () => {
        const [notReady] = make(EXTERNAL).getChildren();
        expect(notReady.contextValue).to.equal("databricks.environment.root.error");
        expect((notReady.iconPath as ThemeIcon).id).to.equal("info");
        const [ready] = make({
            ...EXTERNAL,
            status: "ready",
            checks: [{ id: "x", available: true, title: "X" }],
        }).getChildren();
        expect(ready.contextValue).to.equal("databricks.environment.root.success");
        expect((ready.iconPath as ThemeIcon).id).to.equal("check");
    });
});

// The checklist rows, as the old component rendered each step.
describe("PythonEnvironmentSection checklist rows", () => {
    const rows = (readiness: Readiness, commands: EnvironmentCommands = {}) =>
        make(readiness, { commands }).getChildren(ENVIRONMENT_ROOT);

    it("renders a failing step with an action as a red run row", () => {
        const [row] = rows({
            ...EXTERNAL,
            checks: [
                {
                    id: "checkPythonEnvironment",
                    available: false,
                    title: "Activate",
                    message: "why",
                    action: "selectInterpreter",
                },
            ],
        });
        expect(row.contextValue).to.equal("databricks.environment.checkPythonEnvironment.error");
        expect(row.tooltip).to.equal("why");
        expect((row.iconPath as ThemeIcon).id).to.equal("run");
        expect((row.iconPath as ThemeIcon).color).to.deep.equal(new ThemeColor("errorForeground"));
    });

    it("renders an optional failing step without the red color, and a step without an action as info", () => {
        const [row] = rows({
            ...EXTERNAL,
            checks: [{ id: "checkBuiltins", available: false, title: "Builtins", optional: true }],
        });
        expect((row.iconPath as ThemeIcon).id).to.equal("info");
        expect((row.iconPath as ThemeIcon).color).to.equal(undefined);
    });

    it("renders a passing step as a check, with its warning as a second row", () => {
        const checks = [
            {
                id: "checkPythonEnvironment",
                available: true,
                title: "Active Environment: .venv",
                message: "/p/python",
                warning: "Use python 3.11",
            },
        ];
        const [row, warning] = rows({ ...EXTERNAL, status: "ready", checks });
        expect(row.contextValue).to.equal("databricks.environment.checkPythonEnvironment.success");
        expect((row.iconPath as ThemeIcon).id).to.equal("check");
        expect(warning.label).to.equal("Use python 3.11");
        expect((warning.iconPath as ThemeIcon).id).to.equal("warning");
    });

    it("skips a step without a title", () => {
        expect(
            rows({ ...EXTERNAL, checks: [{ id: "checkCluster", available: true }] }),
        ).to.deep.equal([]);
    });

    it("runs the step command with the step ID once there is one, and none before", () => {
        const check = { id: "checkPythonEnvironment", available: false, title: "Activate" };
        expect(rows({ ...EXTERNAL, checks: [check] })[0].command).to.equal(undefined);
        expect(
            rows({ ...EXTERNAL, checks: [check] }, { step: "databricks.environment.setup" })[0]
                .command,
        ).to.deep.equal({
            title: "Setup python environment",
            command: "databricks.environment.setup",
            arguments: ["checkPythonEnvironment"],
        });
    });
});

// Ported from pythonSetupEntry.test.ts: the session `ready` flag and the drift
// state are one readiness status now.
describe("buildPythonSetupEntry", () => {
    it("renders a run CTA, without the error color, when setup has never completed", () => {
        const [item] = buildPythonSetupEntry("notReady", COMMANDS);
        expect(item.command?.command).to.equal(COMMANDS.setup);
        expect((item.iconPath as ThemeIcon).id).to.equal("rocket");
        expect((item.iconPath as ThemeIcon).color).to.equal(undefined);
    });

    it("keeps a ready environment's row green after a failed re-run", () => {
        const [item] = buildPythonSetupEntry("ready", COMMANDS, true);
        expect((item.iconPath as ThemeIcon).id).to.equal("check");
        expect((item.iconPath as ThemeIcon).color).to.equal(undefined);
    });

    it("renders the run CTA in red when the last setup failed", () => {
        const [item] = buildPythonSetupEntry("notReady", COMMANDS, true);
        expect((item.iconPath as ThemeIcon).id).to.equal("rocket");
        expect((item.iconPath as ThemeIcon).color).to.deep.equal(new ThemeColor("errorForeground"));
        expect(item.label as string).to.match(/set up/i);
    });

    it("renders a ready status line (check icon) once setup succeeded", () => {
        const [item] = buildPythonSetupEntry("ready", COMMANDS);
        expect((item.iconPath as ThemeIcon).id).to.equal("check");
        expect(item.command?.command).to.equal(COMMANDS.setup);
        expect(item.label as string).to.match(/ready/i);
    });

    it("renders an out-of-date state that re-runs setup when drifted", () => {
        const [item] = buildPythonSetupEntry("drifted", COMMANDS);
        expect((item.iconPath as ThemeIcon).id).to.equal("warning");
        expect(item.command?.command).to.equal(COMMANDS.rerun);
        expect(item.label as string).to.match(/out of sync/i);
    });

    it("gives the drifted row a distinct id so VS Code rebinds its command", () => {
        // The drifted state points at a different command than ready/set-up; if
        // it reused the same tree-item id, VS Code would not reliably rebind the
        // command on refresh and the re-run click would be inert.
        const [drifted] = buildPythonSetupEntry("drifted", COMMANDS);
        const [ready] = buildPythonSetupEntry("ready", COMMANDS);
        expect(drifted.id).to.not.equal(ready.id);
    });

    it("returns exactly one entry (mutually exclusive with the checklist)", () => {
        expect(buildPythonSetupEntry("notReady", COMMANDS)).to.have.length(1);
    });

    it("has no command until the uv flow registers one", () => {
        expect(buildPythonSetupEntry("notReady", {})[0].command).to.equal(undefined);
        expect(buildPythonSetupEntry("drifted", {})[0].command).to.equal(undefined);
    });
});
