import assert from "assert";
import {commands, Uri, window, workspace} from "vscode";
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

/**
 * Exercises the `extensions.allowed` gate in startTunnelCommand: when policy
 * blocks the host's Remote - SSH extension, the tunnel must stop with an
 * actionable error instead of proceeding to compute selection. The setting is
 * stubbed at `workspace.getConfiguration` so the WorkspaceConfigs normalisation
 * is covered too.
 */
/* eslint-disable @typescript-eslint/naming-convention -- keys mirror `extensions.allowed` */
describe(`${__filename} extensions.allowed`, () => {
    const VSCODE_SSH = "ms-vscode-remote.remote-ssh";
    const CURSOR_SSH = "anysphere.remote-ssh";

    let originalIsHostCliOnPath: typeof HostUtils.isHostCliOnPath;
    let originalIsCursor: typeof HostUtils.isCursor;
    let originalShowErrorMessage: typeof window.showErrorMessage;
    let originalExecuteCommand: typeof commands.executeCommand;
    let originalGetConfiguration: typeof workspace.getConfiguration;

    let allowedSetting: unknown;
    let shownErrors: {message: string; options: unknown; items: string[]}[];
    let executedCommands: {command: string; args: unknown[]}[];
    let errorResponse: string | undefined;
    let resolvedContext: boolean;

    // Runs the command and reports whether it got past the gate.
    async function startTunnel(): Promise<boolean> {
        const sshCommands = new SshCommands(instance(mock(CliWrapper)));
        resolvedContext = false;
        (sshCommands as any).resolveTunnelContext = async () => {
            resolvedContext = true;
            return undefined;
        };
        await sshCommands.startTunnelCommand();
        return resolvedContext;
    }

    beforeEach(() => {
        allowedSetting = undefined;
        shownErrors = [];
        executedCommands = [];
        errorResponse = undefined;

        originalIsHostCliOnPath = HostUtils.isHostCliOnPath;
        originalIsCursor = HostUtils.isCursor;
        originalShowErrorMessage = window.showErrorMessage;
        originalExecuteCommand = commands.executeCommand;
        originalGetConfiguration = workspace.getConfiguration;

        (HostUtils as any).isHostCliOnPath = async () => true;
        (HostUtils as any).isCursor = () => false;
        (workspace as any).getConfiguration = (section?: string) => {
            const real = originalGetConfiguration(section);
            if (section !== "extensions") {
                return real;
            }
            return {
                ...real,
                get: (key: string) =>
                    key === "allowed" ? allowedSetting : real.get(key),
            };
        };
        (window as any).showErrorMessage = (
            message: string,
            options: unknown,
            ...items: string[]
        ) => {
            shownErrors.push({message, options, items});
            return Promise.resolve(errorResponse);
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
        (HostUtils as any).isCursor = originalIsCursor;
        (window as any).showErrorMessage = originalShowErrorMessage;
        (commands as any).executeCommand = originalExecuteCommand;
        (workspace as any).getConfiguration = originalGetConfiguration;
    });

    const allowedCases: [string, unknown][] = [
        ["the setting is unset", undefined],
        ['the setting is the string "*"', "*"],
        ["all extensions are allowed", {"*": true}],
        ["the publisher is allowed", {"*": false, "ms-vscode-remote": true}],
        [
            'Microsoft is allowed via the "microsoft" special case',
            {"*": false, "microsoft": true},
        ],
        ["the extension is allowed", {"*": false, [VSCODE_SSH]: true}],
        [
            "only stable releases of the extension are allowed",
            {"*": false, [VSCODE_SSH]: "stable"},
        ],
        [
            "specific versions of the extension are allowed",
            {"*": false, [VSCODE_SSH]: ["0.120.0"]},
        ],
        [
            "the extension is allowed despite its publisher being blocked",
            {"*": true, "ms-vscode-remote": false, [VSCODE_SSH]: true},
        ],
        [
            "unrelated extensions are blocked",
            {"*": true, "other-publisher": false, "other.ext": false},
        ],
    ];
    for (const [name, value] of allowedCases) {
        it(`proceeds when ${name}`, async () => {
            allowedSetting = value;

            assert.strictEqual(await startTunnel(), true);
            assert.strictEqual(shownErrors.length, 0);
        });
    }

    const blockedCases: [string, unknown][] = [
        ["all extensions are blocked", {"*": false}],
        [
            "only unrelated extensions are allowed",
            {"*": false, "other-publisher": true, "anysphere": true},
        ],
        [
            "the extension is blocked despite its publisher being allowed",
            {"*": false, "ms-vscode-remote": true, [VSCODE_SSH]: false},
        ],
        [
            "the extension is blocked despite Microsoft being allowed",
            {"*": false, "microsoft": true, [VSCODE_SSH]: false},
        ],
        [
            "the extension is blocked under an allow-all wildcard",
            {"*": true, [VSCODE_SSH]: false},
        ],
        [
            "the publisher is blocked under an allow-all wildcard",
            {"*": true, "ms-vscode-remote": false},
        ],
        [
            "Microsoft is blocked under an allow-all wildcard",
            {"*": true, "microsoft": false},
        ],
    ];
    for (const [name, value] of blockedCases) {
        it(`stops when ${name}`, async () => {
            allowedSetting = value;

            assert.strictEqual(await startTunnel(), false);
            assert.strictEqual(shownErrors.length, 1);
            assert.deepStrictEqual(shownErrors[0].items, ["Open setting"]);
            assert.ok(
                (shownErrors[0].options as {detail: string}).detail.includes(
                    `'${VSCODE_SSH}'`
                )
            );
            assert.strictEqual(executedCommands.length, 0);
        });
    }

    it("opens the setting when the user picks 'Open setting'", async () => {
        allowedSetting = {"*": false};
        errorResponse = "Open setting";

        assert.strictEqual(await startTunnel(), false);
        assert.deepStrictEqual(executedCommands, [
            {
                command: "workbench.action.openSettings",
                args: ["extensions.allowed"],
            },
        ]);
    });

    describe("in Cursor", () => {
        beforeEach(() => {
            (HostUtils as any).isCursor = () => true;
        });

        it("checks the Cursor extension, not the VS Code one", async () => {
            allowedSetting = {"*": false, [VSCODE_SSH]: true};

            assert.strictEqual(await startTunnel(), false);
            assert.ok(
                (shownErrors[0].options as {detail: string}).detail.includes(
                    `'${CURSOR_SSH}'`
                )
            );
        });

        it("proceeds when the Cursor publisher is allowed", async () => {
            allowedSetting = {"*": false, "anysphere": true};

            assert.strictEqual(await startTunnel(), true);
        });

        it('does not treat "microsoft" as covering the Cursor extension', async () => {
            allowedSetting = {"*": false, "microsoft": true};

            assert.strictEqual(await startTunnel(), false);
        });

        it("stops when the Cursor extension is blocked", async () => {
            allowedSetting = {"*": true, [CURSOR_SSH]: false};

            assert.strictEqual(await startTunnel(), false);
        });
    });
});
/* eslint-enable @typescript-eslint/naming-convention */
