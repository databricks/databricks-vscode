import os from "node:os";
import path from "node:path";
import {
    commands,
    env,
    QuickPickItemKind,
    TerminalLocation,
    Uri,
    window,
    workspace,
    type Event,
    type QuickPickItem,
    type Terminal,
    type TerminalOptions,
} from "vscode";
import { bundleInitEnv, bundleInitShellArgs } from "../../kernel/cli/commands/bundleInit";
import type { ChosenProfile, ConnectedProfile } from "../../kernel/connection/commands";
import type { Kernel } from "../../kernel/feature";
import type { SubProject } from "../../kernel/project/ProjectService";
import { CancelledError } from "../../platform/errors";
import type { Logger } from "../../platform/log";
import { detectShellKind } from "../../platform/shell";
import type { QuickInputFactory } from "../../platform/ui/quickPick";

export const TERMINAL_NAME = "Databricks Project Init";

/** The `vscode.window` terminal APIs the wizard uses; injectable for tests. */
interface TerminalHost {
    createTerminal(options: TerminalOptions): Terminal;
    readonly onDidCloseTerminal: Event<Terminal>;
}

export interface BundleInitWizardDeps {
    readonly kernel: Kernel;
    readonly log: Logger;
    /** The connection feature's host and profile steps (`CHOOSE_PROFILE`); undefined when dismissed. */
    readonly chooseProfile: () => Promise<ChosenProfile | undefined>;
    /**
     * The window's connected profile, an expired OAuth session signed in again
     * (`CONNECTED_PROFILE`); undefined when that sign-in was dismissed or failed.
     */
    readonly connectedProfile: () => Promise<ConnectedProfile | undefined>;
    readonly factory?: QuickInputFactory;
    readonly terminals?: TerminalHost;
    /** The default terminal profile's shell, `env.shell`. */
    readonly shell?: () => string;
}

/**
 * The new-project wizard (BNDL-01), ported from the old `BundleInitWizard`.
 * When the window is connected to a profile, it uses that profile
 * (`CONNECTED_PROFILE`) and asks only for the parent folder; to use another
 * workspace, the user switches workspace first. Otherwise it asks host, then
 * profile, then parent folder. It runs the CLI's interactive template wizard
 * in the "Databricks Project Init" editor terminal, then offers the projects
 * it finds below the parent folder. The profile is saved for the new
 * project's default target.
 */
export class BundleInitWizard {
    constructor(private readonly deps: BundleInitWizardDeps) {}

    /** True when a project was created and found. Throws `CancelledError` when dismissed. */
    async run(): Promise<boolean> {
        const { kernel } = this.deps;
        const profile = await this.profileToUse();
        const parent = await pickParentFolder(this.defaultParent(), this.deps.factory);
        if (parent === undefined) {
            throw new CancelledError();
        }
        await this.runInTerminal(parent, profile);
        this.deps.log.debug("Finished the bundle init wizard, looking for new projects");

        const projects = await kernel.project.findSubProjects(parent);
        if (projects.length === 0) {
            await this.noProjectFound(parent);
            return false;
        }
        const root = await pickNewProject(projects);
        if (root !== undefined) {
            await this.open(root, profile.profile);
        }
        return true;
    }

    /** The window's connected profile, else the host and profile steps. */
    private async profileToUse(): Promise<ChosenProfile> {
        const connected = await this.deps.connectedProfile();
        // Its error, if any, is shown already.
        if (connected === undefined) {
            throw new CancelledError();
        }
        return connected.profile ?? (await this.chooseProfile());
    }

    private async chooseProfile(): Promise<ChosenProfile> {
        const profile = await this.deps.chooseProfile();
        if (profile === undefined) {
            throw new CancelledError();
        }
        return profile;
    }

    /** The folder holding the active project, else the first workspace folder, else the user's folder. */
    private defaultParent(): string {
        const root = this.deps.kernel.project.root.value;
        const folder =
            root !== undefined ? workspace.getWorkspaceFolder(Uri.file(root)) : undefined;
        return (folder ?? workspace.workspaceFolders?.[0])?.uri.fsPath ?? os.homedir();
    }

    /** Resolves when the terminal closes: the command line ends with `exit`. */
    private async runInTerminal(parent: string, profile: ChosenProfile): Promise<void> {
        const { kernel } = this.deps;
        const terminals = this.deps.terminals ?? window;
        // The default profile's shell, run with the line as its argument.
        const shell = (this.deps.shell ?? (() => env.shell))();
        const kind = detectShellKind(shell);
        const shellArgs = bundleInitShellArgs(kernel.cli.cliPath, parent, kind);
        const childEnv = kernel.childEnv({
            connection: {
                child: {
                    kind: "profile",
                    host: profile.host,
                    profile: profile.profile,
                    authType: profile.authType ?? "",
                },
            },
            cli: true,
            // As 2.22.0's terminal: the host env, SSL_CERT_FILE and lower-case
            // proxies included, with http.proxy over it.
            environment: "hostAndProxy",
        });

        let terminal: Terminal | undefined;
        const closed = new Promise<void>((resolve) => {
            const subscription = terminals.onDidCloseTerminal((t) => {
                if (t === terminal) {
                    subscription.dispose();
                    resolve();
                }
            });
        });
        terminal = terminals.createTerminal({
            name: TERMINAL_NAME,
            shellPath: shell || (process.platform === "win32" ? "powershell.exe" : "/bin/sh"),
            shellArgs,
            // Until `show()`: the Python extensions skip hidden terminals, so
            // they don't type environment activation into the CLI's wizard,
            // where it would land in its template filter.
            hideFromUser: true,
            isTransient: true,
            location: TerminalLocation.Editor,
            // The full environment: PowerShell doesn't start without it.
            env: bundleInitEnv(childEnv),
            // Otherwise the extension's environment variable collection
            // would override the profile's variables.
            strictEnv: true,
            // Not in a bundle, so the CLI doesn't pick up an unrelated
            // bundle's configuration from the folder or its parents.
            cwd: os.tmpdir(),
        });
        terminal.show();
        await closed;
    }

    /** Saves the profile, if any, for the default target first, so the project's first connection uses it. */
    private async open(root: string, profile: string | undefined): Promise<void> {
        const { project } = this.deps.kernel;
        if (profile === undefined) {
            this.deps.log.info(`New project ${root}`);
        } else {
            const target = await project.saveProfileForNewProject(root, profile);
            this.deps.log.info(
                `New project ${root}, profile ${profile} saved for target ${target ?? "(none)"}`,
            );
        }
        if (workspace.getWorkspaceFolder(Uri.file(root)) === undefined) {
            await commands.executeCommand("vscode.openFolder", Uri.file(root));
            return;
        }
        await project.selectProject(root);
    }

    private async noProjectFound(parent: string): Promise<void> {
        const choice = await window.showInformationMessage(
            `We haven't detected any Databricks projects in "${parent}". If you initialized your project somewhere else, please open the folder manually.`,
            "Open Folder",
        );
        if (choice === "Open Folder") {
            await commands.executeCommand("vscode.openFolder");
        }
    }
}

const OPEN_FOLDER_LABEL = "Open folder selection dialog";

/**
 * The parent folder: the typed path is always item 0 (the spec types one
 * and picks index 0), then a folder dialog. Undefined when dismissed.
 */
export async function pickParentFolder(
    initial: string,
    factory: QuickInputFactory = window,
): Promise<string | undefined> {
    const input = factory.createQuickPick<QuickPickItem>();
    const items = (value: string): QuickPickItem[] => [
        ...(value ? [{ label: value, alwaysShow: true }] : []),
        { label: "", kind: QuickPickItemKind.Separator, alwaysShow: true },
        { label: OPEN_FOLDER_LABEL, alwaysShow: true },
    ];
    input.title = "Provide a path to a folder where you would want your new project to be";
    input.value = initial;
    input.items = items(initial);
    input.ignoreFocusOut = true;
    const choice = await new Promise<QuickPickItem | undefined>((resolve) => {
        const subscriptions = [
            input.onDidChangeValue((value) => {
                input.items = items(value);
            }),
            input.onDidChangeSelection((selected) => selected[0] && done(selected[0])),
            input.onDidHide(() => done(undefined)),
        ];
        const done = (item: QuickPickItem | undefined) => {
            subscriptions.forEach((s) => s.dispose());
            resolve(item);
        };
        input.show();
    });
    input.dispose();
    if (choice === undefined) {
        return undefined;
    }
    if (choice.label !== OPEN_FOLDER_LABEL) {
        return path.normalize(choice.label);
    }
    const folders = await window.showOpenDialog({
        title: "Choose a folder where you would want your new project to be",
        openLabel: "Select folder",
        defaultUri: Uri.file(initial),
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
    });
    return folders?.[0]?.fsPath;
}

type ProjectItem = QuickPickItem & { root?: string };

/**
 * "Select the project you want to open": the new projects, by their path
 * below the parent folder, then "Choose another folder". Undefined when
 * dismissed. Ported from the old `promptToSelectActiveProjectFolder`.
 */
async function pickNewProject(projects: readonly SubProject[]): Promise<string | undefined> {
    const items: ProjectItem[] = [
        ...projects.map((p) => ({ root: p.absolute, label: p.relative, detail: p.absolute })),
        { label: "", kind: QuickPickItemKind.Separator },
        { label: "Choose another folder" },
    ];
    const item = await window.showQuickPick<ProjectItem>(items, {
        title: "Select the project you want to open",
    });
    if (item === undefined) {
        return undefined;
    }
    if (item.root !== undefined) {
        return item.root;
    }
    const folders = await window.showOpenDialog({ canSelectFolders: true, canSelectMany: false });
    return folders?.[0]?.fsPath;
}
