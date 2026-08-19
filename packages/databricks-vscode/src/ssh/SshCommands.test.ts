import assert from "assert";
import {commands, Uri, window} from "vscode";
import {instance, mock} from "ts-mockito";
import {CliWrapper} from "../cli/CliWrapper";
import {SshCommands} from "./SshCommands";
import {HostUtils} from "../utils";

/**
 * Exercises the advisory host-CLI PATH warning in isolation. The prompt is
 * fired-and-forgotten from startTunnelCommand, so tests reach the private
 * warnIfHostCliMissing directly and flush the detached prompt chain it kicks
 * off before asserting on the message and any follow-up command.
 */
describe(__filename, () => {
    let originalIsHostCliOnPath: typeof HostUtils.isHostCliOnPath;
    let originalGetHostCliCommand: typeof HostUtils.getHostCliCommand;
    let originalIsCursor: typeof HostUtils.isCursor;
    let originalShowWarningMessage: typeof window.showWarningMessage;
    let originalExecuteCommand: typeof commands.executeCommand;
    let originalPlatform: PropertyDescriptor | undefined;

    // Messages shown and their offered actions, plus the executed commands, so
    // each test can assert what the user was prompted with and what ran.
    let shownWarnings: {message: string; items: string[]}[];
    let executedCommands: {command: string; args: unknown[]}[];
    // The action the stubbed warning resolves with (what the user "clicks").
    let warningResponse: string | undefined;

    function stubPlatform(value: NodeJS.Platform) {
        Object.defineProperty(process, "platform", {
            value,
            configurable: true,
        });
    }

    function newSshCommands(): SshCommands {
        return new SshCommands(instance(mock(CliWrapper)));
    }

    // Runs the fire-and-forget warning, then drains the microtask queue so the
    // detached prompt chain (warning → follow-up command) has fully settled.
    async function warn(sshCommands: SshCommands) {
        await (sshCommands as any).warnIfHostCliMissing();
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    beforeEach(() => {
        shownWarnings = [];
        executedCommands = [];
        warningResponse = undefined;

        originalIsHostCliOnPath = HostUtils.isHostCliOnPath;
        originalGetHostCliCommand = HostUtils.getHostCliCommand;
        originalIsCursor = HostUtils.isCursor;
        originalShowWarningMessage = window.showWarningMessage;
        originalExecuteCommand = commands.executeCommand;
        originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");

        (window as any).showWarningMessage = (
            message: string,
            ...items: string[]
        ) => {
            shownWarnings.push({message, items});
            return Promise.resolve(warningResponse);
        };
        (commands as any).executeCommand = (
            command: string,
            ...args: unknown[]
        ) => {
            executedCommands.push({command, args});
            return Promise.resolve();
        };
    });

    afterEach(() => {
        (HostUtils as any).isHostCliOnPath = originalIsHostCliOnPath;
        (HostUtils as any).getHostCliCommand = originalGetHostCliCommand;
        (HostUtils as any).isCursor = originalIsCursor;
        (window as any).showWarningMessage = originalShowWarningMessage;
        (commands as any).executeCommand = originalExecuteCommand;
        if (originalPlatform) {
            Object.defineProperty(process, "platform", originalPlatform);
        }
    });

    it("shows no warning when the host CLI is on PATH", async () => {
        (HostUtils as any).isHostCliOnPath = async () => true;

        await warn(newSshCommands());

        assert.strictEqual(shownWarnings.length, 0);
        assert.strictEqual(executedCommands.length, 0);
    });

    it("offers the shell-command installer on macOS", async () => {
        (HostUtils as any).isHostCliOnPath = async () => false;
        (HostUtils as any).getHostCliCommand = () => "code";
        stubPlatform("darwin");
        warningResponse = "Install shell command";

        await warn(newSshCommands());

        assert.strictEqual(shownWarnings.length, 1);
        assert.ok(shownWarnings[0].message.includes('"code"'));
        assert.deepStrictEqual(shownWarnings[0].items, [
            "Install shell command",
        ]);
        assert.deepStrictEqual(executedCommands, [
            {command: "workbench.action.installCommandLine", args: []},
        ]);
    });

    it("does not run the installer on macOS when the prompt is dismissed", async () => {
        (HostUtils as any).isHostCliOnPath = async () => false;
        (HostUtils as any).getHostCliCommand = () => "code";
        stubPlatform("darwin");
        warningResponse = undefined;

        await warn(newSshCommands());

        assert.strictEqual(shownWarnings.length, 1);
        assert.strictEqual(executedCommands.length, 0);
    });

    it("points at the VS Code PATH docs off macOS", async () => {
        (HostUtils as any).isHostCliOnPath = async () => false;
        (HostUtils as any).getHostCliCommand = () => "code";
        (HostUtils as any).isCursor = () => false;
        stubPlatform("linux");
        warningResponse = "Setup instructions";

        await warn(newSshCommands());

        assert.strictEqual(shownWarnings.length, 1);
        assert.deepStrictEqual(shownWarnings[0].items, ["Setup instructions"]);
        assert.strictEqual(executedCommands.length, 1);
        assert.strictEqual(executedCommands[0].command, "vscode.open");
        assert.strictEqual(
            (executedCommands[0].args[0] as Uri).toString(),
            Uri.parse(
                "https://code.visualstudio.com/docs/setup/setup-overview"
            ).toString()
        );
    });

    it("points at the Cursor PATH docs off macOS in Cursor", async () => {
        (HostUtils as any).isHostCliOnPath = async () => false;
        (HostUtils as any).getHostCliCommand = () => "cursor";
        (HostUtils as any).isCursor = () => true;
        stubPlatform("linux");
        warningResponse = "Setup instructions";

        await warn(newSshCommands());

        assert.strictEqual(
            (executedCommands[0].args[0] as Uri).toString(),
            Uri.parse("https://docs.cursor.com/en/cli/installation").toString()
        );
    });

    it("does not open docs off macOS when the prompt is dismissed", async () => {
        (HostUtils as any).isHostCliOnPath = async () => false;
        (HostUtils as any).getHostCliCommand = () => "code";
        (HostUtils as any).isCursor = () => false;
        stubPlatform("linux");
        warningResponse = undefined;

        await warn(newSshCommands());

        assert.strictEqual(shownWarnings.length, 1);
        assert.strictEqual(executedCommands.length, 0);
    });
});
