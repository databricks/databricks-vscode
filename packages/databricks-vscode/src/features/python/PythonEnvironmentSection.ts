import { ThemeColor, ThemeIcon, TreeItemCollapsibleState, type Event } from "vscode";
import {
    SECTION_ORDER,
    type ConfigurationItem,
    type ConfigurationSection,
} from "../../platform/ui/sections";
import { CLUSTER_CHECK_ID } from "./setup/external/checks";
import type { Readiness, ReadinessCheck } from "./setup/readiness";

export const ENVIRONMENT_GROUP_ID = "ENVIRONMENT";
export const PYTHON_SETUP_ENTRY_ID = "ENVIRONMENT_PYTHON_SETUP";
// Distinct tree-item id: VS Code doesn't reliably rebind a node's `command` when
// the id stays the same but the command changes across a refresh. The drifted
// row points at a different command (rerunPythonEnv) than the ready/set-up row
// (setupPythonEnv), so it must be a separate node or the re-run click is inert.
const PYTHON_SETUP_DRIFTED_ENTRY_ID = "ENVIRONMENT_PYTHON_SETUP_DRIFTED";

const itemContext = (key: string, available: boolean) =>
    `databricks.environment.${key}.${available ? "success" : "error"}`;

/**
 * The commands the rows run: `setup` and `rerun` (the uv row), and `step` (a
 * checklist row, called with the step ID). A row without its command is
 * shown without one.
 */
export interface EnvironmentCommands {
    readonly setup?: string;
    readonly rerun?: string;
    readonly step?: string;
}

export interface PythonEnvironmentSectionInputs {
    /** Connected, with a development target. */
    visible(): boolean;
    /** Undefined until the first evaluation: nothing shows until the strategy is known. */
    readiness(): Readiness | undefined;
    readonly commands: EnvironmentCommands;
}

/**
 * The uv strategy's single row, in precedence order: drifted -> an out-of-sync
 * warning that re-runs setup; ready -> a check that can still be re-run;
 * neither -> a run CTA (rocket), in red only when the last setup failed.
 * Ported from `buildPythonSetupEntry`.
 */
export function buildPythonSetupEntry(
    status: Readiness["status"],
    commands: EnvironmentCommands,
    setupFailed = false,
): ConfigurationItem[] {
    if (status === "drifted") {
        return [
            {
                id: PYTHON_SETUP_DRIFTED_ENTRY_ID,
                label: "Python environment is out of sync",
                tooltip:
                    "The selected compute no longer matches your Python environment. Re-run setup to align it.",
                contextValue: "databricks.environment.pythonSetup.drifted",
                iconPath: new ThemeIcon("warning", errorColor()),
                collapsibleState: TreeItemCollapsibleState.None,
                command:
                    commands.rerun === undefined
                        ? undefined
                        : { title: "Re-run Python setup", command: commands.rerun },
            },
        ];
    }
    const done = status === "ready";
    return [
        {
            id: PYTHON_SETUP_ENTRY_ID,
            label: done ? "Python environment ready" : "Set up Python environment",
            contextValue: `databricks.environment.pythonSetup.${done ? "success" : "error"}`,
            iconPath: done
                ? new ThemeIcon("check")
                : new ThemeIcon("rocket", setupFailed ? errorColor() : undefined),
            collapsibleState: TreeItemCollapsibleState.None,
            command:
                commands.setup === undefined
                    ? undefined
                    : { title: "Set up Python environment", command: commands.setup },
        },
    ];
}

/** A missing compute check is calm, as "Select compute" is. Environment checks stay red. */
function isComputeCheck(check: ReadinessCheck): boolean {
    return check.id === CLUSTER_CHECK_ID;
}

const errorColor = () => new ThemeColor("errorForeground");

/** The external strategy's group: "Python Environment", expanded while something is missing. */
function environmentGroup(readiness: Readiness): ConfigurationItem {
    const available = readiness.status === "ready";
    const blocked = readiness.checks.some((c) => !c.available && !c.optional && !isComputeCheck(c));
    return {
        label: "Python Environment",
        id: ENVIRONMENT_GROUP_ID,
        contextValue: itemContext("root", available),
        iconPath: available
            ? new ThemeIcon("check", new ThemeColor("debugIcon.startForeground"))
            : new ThemeIcon("info", blocked ? errorColor() : undefined),
        collapsibleState: available
            ? TreeItemCollapsibleState.Collapsed
            : TreeItemCollapsibleState.Expanded,
    };
}

/** A check's rows, as the old `EnvironmentComponent.getChildren` rendered a step. */
function checkRows(check: ReadinessCheck, commands: EnvironmentCommands): ConfigurationItem[] {
    const none = TreeItemCollapsibleState.None;
    if (!check.title) {
        return [];
    }
    if (!check.available) {
        const color = check.optional || isComputeCheck(check) ? undefined : errorColor();
        return [
            {
                contextValue: itemContext(check.id, false),
                label: check.title,
                tooltip: check.message,
                iconPath: new ThemeIcon(check.action !== undefined ? "run" : "info", color),
                collapsibleState: none,
                command:
                    commands.step === undefined
                        ? undefined
                        : {
                              title: "Setup python environment",
                              command: commands.step,
                              arguments: [check.id],
                          },
            },
        ];
    }
    const rows: ConfigurationItem[] = [
        {
            contextValue: itemContext(check.id, true),
            label: check.title,
            tooltip: check.message,
            iconPath: new ThemeIcon("check"),
            collapsibleState: none,
        },
    ];
    if (check.warning) {
        rows.push({
            contextValue: itemContext(check.id, true),
            label: check.warning,
            iconPath: new ThemeIcon("warning"),
            collapsibleState: none,
        });
    }
    return rows;
}

/**
 * The Python environment rows (PYENV-01, PYENV-07), rendered from the
 * session's readiness. The uv strategy shows one top-level row, "Set up
 * Python environment"; the external one a "Python Environment" group with
 * the checklist below it. The two are never shown together. Ported from the
 * old `EnvironmentComponent` and `pythonSetupEntry`.
 */
export class PythonEnvironmentSection implements ConfigurationSection {
    readonly id = "python.environment";
    readonly order = SECTION_ORDER.pythonEnvironment;

    constructor(
        private readonly inputs: PythonEnvironmentSectionInputs,
        readonly onDidChange?: Event<void>,
    ) {}

    getChildren(parent?: ConfigurationItem): ConfigurationItem[] {
        const readiness = this.inputs.readiness();
        if (!this.inputs.visible() || readiness === undefined) {
            return [];
        }
        if (parent === undefined) {
            // With uv the group would hold a single child, so that row is promoted to the top level.
            return readiness.strategy === "uv"
                ? buildPythonSetupEntry(
                      readiness.status,
                      this.inputs.commands,
                      readiness.setupFailed === true,
                  )
                : [environmentGroup(readiness)];
        }
        if (parent.id !== ENVIRONMENT_GROUP_ID || readiness.strategy !== "external") {
            return [];
        }
        return readiness.checks.flatMap((check) => checkRows(check, this.inputs.commands));
    }
}
