import path from "node:path";
import { ThemeIcon, TreeItemCollapsibleState } from "vscode";
import {
    SECTION_ORDER,
    type ConfigurationItem,
    type ConfigurationSection,
} from "../../platform/ui/sections";

/**
 * A session window's Python, in the Project view: one row, with nothing to
 * set up. The SSH tunnel made the interpreter, installed its packages and
 * the notebook init script; the extension only selects the interpreter.
 */
export class SessionPythonSection implements ConfigurationSection {
    readonly id = "python.session";
    readonly order = SECTION_ORDER.pythonEnvironment;

    constructor(private readonly interpreter: string | undefined) {}

    getChildren(parent?: ConfigurationItem): ConfigurationItem[] {
        if (parent !== undefined) {
            return [];
        }
        const interpreter = this.interpreter;
        return [
            {
                label: "Python environment",
                id: "ENVIRONMENT_SESSION",
                description:
                    interpreter === undefined
                        ? "The session's"
                        : `The session's (${path.basename(path.dirname(path.dirname(interpreter)))})`,
                tooltip:
                    interpreter === undefined
                        ? "The SSH tunnel's session named no interpreter (DATABRICKS_VIRTUAL_ENV). Its Python, packages and notebook init script come with the session."
                        : `${interpreter}\nThe SSH tunnel's session set this interpreter up, with its packages and the notebook init script.`,
                iconPath: new ThemeIcon("check"),
                collapsibleState: TreeItemCollapsibleState.None,
            },
        ];
    }
}
