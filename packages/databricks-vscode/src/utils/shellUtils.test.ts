import assert from "assert";
import {execFile} from "child_process";
import {existsSync} from "fs";
import {promisify} from "util";
import {createArgvPrinter, runWindowsCases} from "../test/windowsShellHarness";
import {
    clearCmd,
    commandSeparator,
    detectShellKind,
    echoCmd,
    escapeExecutableForTerminal,
    escapePathArgument,
    hasCmdUnsafeChars,
    readCmd,
    resolveTerminalShell,
    ShellKind,
    terminalShellKind,
} from "./shellUtils";

const execFileAsync = promisify(execFile);

const ALL_KINDS: ShellKind[] = ["cmd", "powershell", "posix"];

describe(__filename, () => {
    describe("detectShellKind", () => {
        const cases: [string, NodeJS.Platform, ShellKind][] = [
            // Windows cmd, as VS Code reports it.
            ["C:\\Windows\\System32\\cmd.exe", "win32", "cmd"],
            // env.shell casing is not guaranteed.
            ["C:\\Windows\\System32\\CMD.EXE", "win32", "cmd"],
            ["cmd.exe", "win32", "cmd"],
            // Windows PowerShell 5 and PowerShell 7+.
            [
                "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
                "win32",
                "powershell",
            ],
            [
                "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
                "win32",
                "powershell",
            ],
            // pwsh is cross-platform, so it is not gated on win32.
            ["/usr/local/bin/pwsh", "darwin", "powershell"],
            // Git Bash / WSL style shells on Windows are POSIX, not cmd.
            ["C:\\Program Files\\Git\\bin\\bash.exe", "win32", "posix"],
            ["C:\\Windows\\System32\\wsl.exe", "win32", "posix"],
            ["/bin/bash", "linux", "posix"],
            ["/bin/zsh", "darwin", "posix"],
            ["/usr/bin/fish", "linux", "posix"],
        ];

        cases.forEach(([shell, platform, expected]) => {
            it(`classifies ${shell} on ${platform} as ${expected}`, () => {
                assert.strictEqual(detectShellKind(shell, platform), expected);
            });
        });

        it("does not treat a path merely containing 'cmd' as cmd.exe", () => {
            // Regression: a substring match on the full path misclassifies
            // Cmder's bash, leaving the user with cls/pause in a POSIX shell.
            assert.strictEqual(
                detectShellKind(
                    "C:\\cmder\\vendor\\git-for-windows\\bin\\bash.exe",
                    "win32"
                ),
                "posix"
            );
        });

        it("does not treat cmd.exe as cmd on non-Windows platforms", () => {
            assert.strictEqual(
                detectShellKind("/usr/bin/cmd", "linux"),
                "posix"
            );
        });

        it("falls back to the platform default when env.shell is empty", () => {
            // Callers cannot pin shellPath to "", so VS Code launches the
            // configured default profile. Assuming POSIX on Windows would send a
            // `printf`/`read _` line to PowerShell.
            assert.strictEqual(detectShellKind("", "win32"), "powershell");
            assert.strictEqual(detectShellKind("", "darwin"), "posix");
            assert.strictEqual(detectShellKind("", "linux"), "posix");
        });

        it("still treats a named but unrecognised windows shell as posix", () => {
            // The empty-shell fallback must not swallow this case: bash.exe is a
            // POSIX shell and is what actually gets launched.
            assert.strictEqual(
                detectShellKind(
                    "C:\\Program Files\\Git\\bin\\bash.exe",
                    "win32"
                ),
                "posix"
            );
        });
    });

    describe("terminalShellKind", () => {
        // A reused terminal is whatever profile the user had focused, so the
        // kind must come from the terminal's own shellPath. Deriving it from
        // env.shell (the *default* profile) is #1822 with the shells swapped.
        function terminal(shellPath?: string) {
            return {creationOptions: {shellPath}};
        }

        it("classifies a reused terminal from its own shellPath", () => {
            assert.strictEqual(
                terminalShellKind(
                    terminal("C:\\Program Files\\PowerShell\\7\\pwsh.exe"),
                    "win32"
                ),
                "powershell"
            );
            assert.strictEqual(
                terminalShellKind(terminal("/bin/zsh"), "darwin"),
                "posix"
            );
        });

        it("classifies a cmd.exe tab as cmd, not as the default profile", () => {
            // The regression this guards: a Windows user whose default profile
            // is Git Bash (env.shell = bash.exe -> posix) with a cmd tab
            // focused got POSIX single quotes, which cmd does not treat as
            // quoting at all — it looks for a program named literally
            // "'C:\Python\python.exe'", quotes included, and fails. main
            // survived the mismatch by accident because it double-quoted, which
            // parses in both shells.
            assert.strictEqual(
                terminalShellKind(
                    terminal("C:\\Windows\\System32\\cmd.exe"),
                    "win32"
                ),
                "cmd"
            );
        });

        it("does not emit a powershell call operator into a cmd tab", () => {
            // The reverse mismatch: `& 'C:\...\python.exe'` is what PowerShell
            // needs and what cmd chokes on. Deriving the kind from the terminal
            // keeps the two in step.
            const cmdTab = terminal("C:\\Windows\\System32\\cmd.exe");
            const kind = terminalShellKind(cmdTab, "win32");
            const line = escapeExecutableForTerminal(
                "C:\\Python\\python.exe",
                kind
            );
            assert.strictEqual(line, '"C:\\Python\\python.exe"');
            assert.ok(!line.startsWith("&"), line);
            assert.ok(!line.startsWith("'"), line);
        });

        it("falls back to the ambient shell when shellPath is unset", () => {
            // An inherited-profile terminal reports no shellPath, and that is
            // exactly the case env.shell does describe. Must not throw or
            // misclassify for extension pseudoterminals either.
            const expected = terminalShellKind(terminal(undefined));
            assert.ok(ALL_KINDS.includes(expected));
            assert.strictEqual(terminalShellKind(terminal("")), expected);
        });
    });

    // The profile keys below are VS Code's own display names
    // ("Ubuntu-22.04", "Git Bash", "Command Prompt"), so they cannot be
    // camelCased without ceasing to match real settings.
    /* eslint-disable @typescript-eslint/naming-convention */
    describe("resolveTerminalShell", () => {
        // env.shell reports a *path* only. VS Code builds a fresh profile from
        // an explicit executable and never fills args back in, so pinning
        // shellPath alone drops them — hence the rule that the shell is pinned
        // only when the configured profile proves the args belong to it.
        const wslProfiles = {
            "Ubuntu-22.04": {
                path: "wsl.exe",
                args: ["-d", "Ubuntu-22.04"],
            },
        };

        it("pins the shell and forwards its args when the profile matches", () => {
            // Without the args the terminal lands in the *default* distro, so
            // bundle init scaffolds into a different filesystem than the user
            // configured and getSubProjects then reports no projects found.
            assert.deepStrictEqual(
                resolveTerminalShell(
                    "wsl.exe",
                    "Ubuntu-22.04",
                    wslProfiles,
                    "win32"
                ),
                {
                    kind: "posix",
                    shellPath: "wsl.exe",
                    shellArgs: wslProfiles["Ubuntu-22.04"].args,
                }
            );
        });

        it("matches the profile path case-insensitively and by basename", () => {
            assert.deepStrictEqual(
                resolveTerminalShell(
                    "C:\\Windows\\System32\\wsl.exe",
                    "Ubuntu-22.04",
                    wslProfiles,
                    "win32"
                ),
                {
                    kind: "posix",
                    shellPath: "C:\\Windows\\System32\\wsl.exe",
                    shellArgs: ["-d", "Ubuntu-22.04"],
                }
            );
        });

        it("forwards Git Bash's --login when the profile names a path", () => {
            assert.deepStrictEqual(
                resolveTerminalShell(
                    "C:\\Program Files\\Git\\bin\\bash.exe",
                    "Git Bash",
                    {
                        "Git Bash": {
                            path: "C:\\Program Files\\Git\\bin\\bash.exe",
                            args: ["--login"],
                        },
                    },
                    "win32"
                ),
                {
                    kind: "posix",
                    shellPath: "C:\\Program Files\\Git\\bin\\bash.exe",
                    shellArgs: ["--login"],
                }
            );
        });

        it("does not pin a source-based profile, whose args it cannot see", () => {
            // Regression: VS Code's own default Windows profiles are written
            // `{"Git Bash": {"source": "Git Bash"}}` — no path, and the args it
            // launches with (`--login`) are not in settings at all. Pinning
            // bash.exe with no args gives a *non-login* shell: a different PATH
            // and no profile scripts, unlike every other terminal the user
            // opens. Classify the shell, but let VS Code launch it.
            assert.deepStrictEqual(
                resolveTerminalShell(
                    "C:\\Program Files\\Git\\bin\\bash.exe",
                    "Git Bash",
                    {"Git Bash": {source: "Git Bash"}},
                    "win32"
                ),
                {kind: "posix"}
            );
            assert.deepStrictEqual(
                resolveTerminalShell(
                    "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
                    "PowerShell",
                    {PowerShell: {source: "PowerShell"}},
                    "win32"
                ),
                {kind: "powershell"}
            );
        });

        it("does not pin when the profile is for a different shell", () => {
            // Passing another shell's args is worse than passing none: a
            // renamed or source-based profile can point at a different
            // executable than env.shell reports.
            assert.deepStrictEqual(
                resolveTerminalShell(
                    "pwsh.exe",
                    "Ubuntu-22.04",
                    wslProfiles,
                    "win32"
                ),
                {kind: "powershell"}
            );
        });

        it("still classifies env.shell when there is no profile to consult", () => {
            // Not pinning costs nothing: env.shell *is* the resolved path of the
            // default profile, so it describes the shell VS Code will launch.
            assert.deepStrictEqual(
                resolveTerminalShell(
                    "/bin/zsh",
                    undefined,
                    undefined,
                    "darwin"
                ),
                {kind: "posix"}
            );
            assert.deepStrictEqual(
                resolveTerminalShell(
                    "C:\\Windows\\System32\\cmd.exe",
                    undefined,
                    undefined,
                    "win32"
                ),
                {kind: "cmd"}
            );
            // A null entry is how VS Code settings mark a profile as removed.
            assert.deepStrictEqual(
                resolveTerminalShell(
                    "pwsh.exe",
                    "PowerShell",
                    {PowerShell: null},
                    "win32"
                ),
                {kind: "powershell"}
            );
        });

        it("pins with no args when the matching profile has none", () => {
            assert.deepStrictEqual(
                resolveTerminalShell(
                    "pwsh.exe",
                    "PowerShell",
                    {PowerShell: {path: "pwsh.exe"}},
                    "win32"
                ),
                {
                    kind: "powershell",
                    shellPath: "pwsh.exe",
                    shellArgs: undefined,
                }
            );
        });

        it("prefers env.shell over the configured profile's path", () => {
            // env.shell is what VS Code resolved; the profile is only consulted
            // for the args that go with it.
            assert.deepStrictEqual(
                resolveTerminalShell(
                    "/bin/zsh",
                    "Command Prompt",
                    {"Command Prompt": {path: "cmd.exe"}},
                    "win32"
                ),
                {kind: "posix"}
            );
        });

        describe("when env.shell is empty", () => {
            // Shell-less environments report "". Callers then pass
            // shellPath: undefined, so VS Code launches the configured default
            // profile — which may well be cmd.exe or Git Bash, not the
            // PowerShell a bare platform-default guess assumes. A mis-shaped
            // line means nothing runs (not even the trailing `exit`), leaving
            // the wizard awaiting a terminal-close event forever.
            it("classifies from the configured default profile", () => {
                assert.deepStrictEqual(
                    resolveTerminalShell(
                        "",
                        "Command Prompt",
                        {"Command Prompt": {path: "cmd.exe"}},
                        "win32"
                    ),
                    {kind: "cmd"}
                );
                assert.deepStrictEqual(
                    resolveTerminalShell(
                        "",
                        "Git Bash",
                        {
                            "Git Bash": {
                                path: "C:\\Program Files\\Git\\bin\\bash.exe",
                            },
                        },
                        "win32"
                    ),
                    {kind: "posix"}
                );
            });

            it("takes the first candidate when a profile lists several paths", () => {
                assert.deepStrictEqual(
                    resolveTerminalShell(
                        "",
                        "PowerShell",
                        {PowerShell: {path: ["pwsh.exe", "powershell.exe"]}},
                        "win32"
                    ),
                    {kind: "powershell"}
                );
            });

            it("classifies a source-only default profile", () => {
                assert.deepStrictEqual(
                    resolveTerminalShell(
                        "",
                        "Command Prompt",
                        {"Command Prompt": {source: "PowerShell"}},
                        "win32"
                    ),
                    {kind: "powershell"}
                );
                assert.deepStrictEqual(
                    resolveTerminalShell(
                        "",
                        "Git Bash",
                        {"Git Bash": {source: "Git Bash"}},
                        "win32"
                    ),
                    {kind: "posix"}
                );
            });

            it("falls back to the platform default, never to cmd", () => {
                // Regression: ComSpec was consulted here, and on Windows it is
                // *always* cmd.exe — it describes what the OS would run, never
                // what VS Code will. Every shell-less Windows environment was
                // classified cmd while PowerShell actually started, so the
                // ` & `-separated line failed to parse and nothing ran. This
                // also made detectShellKind's win32 default unreachable.
                assert.deepStrictEqual(
                    resolveTerminalShell("", undefined, undefined, "win32"),
                    {kind: "powershell"}
                );
                // An unrecognised source must not defeat the fallback either.
                assert.deepStrictEqual(
                    resolveTerminalShell(
                        "",
                        "Custom",
                        {Custom: {source: "Something Else"}},
                        "win32"
                    ),
                    {kind: "powershell"}
                );
                assert.deepStrictEqual(
                    resolveTerminalShell("", undefined, undefined, "darwin"),
                    {kind: "posix"}
                );
                assert.deepStrictEqual(
                    resolveTerminalShell("", undefined, undefined, "linux"),
                    {kind: "posix"}
                );
            });

            it("never pins a shell it cannot name", () => {
                // shellPath: "" is not a launchable path, so every empty-shell
                // result must leave the launch to VS Code.
                const profiles = {
                    "Command Prompt": {path: "cmd.exe", args: ["/K"]},
                };
                (
                    [
                        ["Command Prompt", profiles],
                        [undefined, undefined],
                    ] as const
                ).forEach(([name, ps]) => {
                    const resolved = resolveTerminalShell(
                        "",
                        name,
                        ps,
                        "win32"
                    );
                    assert.strictEqual(resolved.shellPath, undefined);
                    assert.strictEqual(resolved.shellArgs, undefined);
                });
            });
        });
    });
    /* eslint-enable @typescript-eslint/naming-convention */

    describe("clearCmd", () => {
        it("returns the clear command for each shell", () => {
            assert.strictEqual(clearCmd("cmd"), "cls");
            assert.strictEqual(clearCmd("powershell"), "Clear-Host");
            assert.strictEqual(clearCmd("posix"), "clear");
        });
    });

    describe("readCmd", () => {
        it("returns the hold-open command for each shell", () => {
            assert.strictEqual(readCmd("cmd"), "pause");
            assert.strictEqual(readCmd("powershell"), "Read-Host");
            // `read` needs a variable name: bare `read` is a syntax error in
            // dash, which would close the terminal instead of holding it.
            assert.strictEqual(readCmd("posix"), "read _");
        });
    });

    describe("commandSeparator", () => {
        it("uses & for cmd.exe, which has no ; separator", () => {
            assert.strictEqual(commandSeparator("cmd"), " & ");
        });

        it("uses ; for powershell and posix", () => {
            assert.strictEqual(commandSeparator("powershell"), "; ");
            assert.strictEqual(commandSeparator("posix"), "; ");
        });
    });

    describe("escapePathArgument", () => {
        it("wraps a plain path in quotes", () => {
            assert.strictEqual(
                escapePathArgument("C:\\Users\\me\\project", "cmd"),
                '"C:\\Users\\me\\project"'
            );
            assert.strictEqual(
                escapePathArgument("/home/me/project", "posix"),
                "'/home/me/project'"
            );
        });

        it("quotes paths containing spaces", () => {
            assert.strictEqual(
                escapePathArgument("C:\\Program Files\\db", "powershell"),
                "'C:\\Program Files\\db'"
            );
            assert.strictEqual(
                escapePathArgument("/Users/me/My Project", "posix"),
                "'/Users/me/My Project'"
            );
        });

        it("never doubles backslashes, which are path separators on Windows", () => {
            ALL_KINDS.forEach((kind) => {
                assert.ok(
                    !escapePathArgument("C:\\a\\b", kind).includes("\\\\"),
                    `${kind} must not escape backslashes`
                );
            });
        });

        it("doubles embedded quotes for cmd.exe", () => {
            assert.strictEqual(
                escapePathArgument('C:\\a"b', "cmd"),
                '"C:\\a""b"'
            );
        });

        it("single-quotes for powershell and doubles embedded quotes", () => {
            assert.strictEqual(
                escapePathArgument('C:\\a"b', "powershell"),
                `'C:\\a"b'`
            );
            assert.strictEqual(
                escapePathArgument("C:\\a'b", "powershell"),
                "'C:\\a''b'"
            );
        });

        it("stops powershell from interpolating $ and running $(...)", () => {
            // Regression: double-quoted PowerShell strings interpolate, so
            // "$RECYCLE.BIN" expanded to ".BIN" and "$(whoami)" *executed*.
            // Single quotes are literal in PowerShell.
            assert.strictEqual(
                escapePathArgument("C:\\Users\\me\\$RECYCLE.BIN", "powershell"),
                "'C:\\Users\\me\\$RECYCLE.BIN'"
            );
            assert.strictEqual(
                escapePathArgument("C:\\a$(whoami)b", "powershell"),
                "'C:\\a$(whoami)b'"
            );
            assert.strictEqual(
                escapePathArgument("C:\\a`b", "powershell"),
                "'C:\\a`b'"
            );
        });

        it("single-quotes for posix so $ and backticks do not expand", () => {
            assert.strictEqual(
                escapePathArgument("/tmp/$HOME/`whoami`", "posix"),
                "'/tmp/$HOME/`whoami`'"
            );
        });

        it("flags % as unrepresentable in cmd.exe rather than corrupting it", () => {
            // cmd expands %VAR% even inside double quotes and has no escape for
            // it, so callers must detect and refuse instead of silently passing
            // the wrong directory to the CLI.
            assert.ok(hasCmdUnsafeChars("C:\\p%TEMP%q"));
            assert.ok(!hasCmdUnsafeChars("C:\\Users\\me\\project"));
        });

        it("also flags !, which expands under delayed expansion", () => {
            // `cmd /V:ON` (or DelayedExpansion in the registry, which some
            // corporate images enable) expands !VAR! inside double quotes too.
            assert.ok(hasCmdUnsafeChars("C:\\p!TEMP!q"));
        });

        it("escapes every embedded quote, not just the first", () => {
            // Regression: String.replace (vs replaceAll) left later quotes bare,
            // which terminates the argument early.
            assert.strictEqual(escapePathArgument('a"b"c', "cmd"), '"a""b""c"');
            assert.strictEqual(
                escapePathArgument("a'b'c", "posix"),
                `'a'\\''b'\\''c'`
            );
        });

        it("handles an empty argument", () => {
            assert.strictEqual(escapePathArgument("", "cmd"), '""');
            assert.strictEqual(escapePathArgument("", "posix"), "''");
        });
    });

    describe("escapeExecutableForTerminal", () => {
        it("prefixes the powershell call operator so the path is executed", () => {
            // Without &, PowerShell echoes a quoted string instead of running it.
            assert.strictEqual(
                escapeExecutableForTerminal(
                    "C:\\Program Files\\db.exe",
                    "powershell"
                ),
                "& 'C:\\Program Files\\db.exe'"
            );
        });

        it("only quotes for cmd and posix", () => {
            assert.strictEqual(
                escapeExecutableForTerminal("C:\\bin\\db.exe", "cmd"),
                '"C:\\bin\\db.exe"'
            );
            assert.strictEqual(
                escapeExecutableForTerminal("/usr/bin/db", "posix"),
                "'/usr/bin/db'"
            );
        });

        it("escapes quotes in the executable path", () => {
            assert.strictEqual(
                escapeExecutableForTerminal('/usr/bin/we"ird', "posix"),
                `'/usr/bin/we"ird'`
            );
        });
    });

    describe("echoCmd", () => {
        it("prints a single line", () => {
            assert.strictEqual(
                echoCmd("hello", "posix"),
                `printf '%s\\n' 'hello'`
            );
            assert.strictEqual(echoCmd("hello", "cmd"), "echo hello");
            assert.strictEqual(
                echoCmd("hello", "powershell"),
                "Write-Host 'hello'"
            );
        });

        it("uses printf on posix, not echo, so backslashes stay literal", () => {
            // Regression: zsh's and dash's builtin echo interpret \t and \c even
            // inside single quotes, so `echo` mangled paths and `\c` truncated
            // the line outright. Proven against real shells further down.
            assert.strictEqual(
                echoCmd("dir: /tmp/my\\test", "posix"),
                `printf '%s\\n' 'dir: /tmp/my\\test'`
            );
        });

        it("splits multiline messages into one command per line", () => {
            // cmd.exe's echo cannot emit a newline, so each line needs its own
            // echo joined by the separator.
            assert.strictEqual(
                echoCmd("one\ntwo", "cmd"),
                "echo one & echo two"
            );
            assert.strictEqual(
                echoCmd("one\ntwo", "posix"),
                `printf '%s\\n' 'one'; printf '%s\\n' 'two'`
            );
            assert.strictEqual(
                echoCmd("one\ntwo", "powershell"),
                "Write-Host 'one'; Write-Host 'two'"
            );
        });

        it("handles CRLF line endings", () => {
            assert.strictEqual(
                echoCmd("one\r\ntwo", "posix"),
                `printf '%s\\n' 'one'; printf '%s\\n' 'two'`
            );
        });

        it("emits a blank line without swallowing it", () => {
            // Bare `echo` in cmd.exe prints the echo state, not a blank line.
            assert.strictEqual(echoCmd("", "cmd"), "echo.");
            assert.strictEqual(echoCmd("a\n", "cmd"), "echo a & echo.");
            assert.strictEqual(echoCmd("", "posix"), `printf '%s\\n' ''`);
        });

        it("escapes cmd.exe metacharacters so the chain is not broken", () => {
            // Unescaped, `echo a & b` would run b as a command, and `>` would
            // redirect the message into a file.
            assert.strictEqual(echoCmd("a & b", "cmd"), "echo a ^& b");
            assert.strictEqual(echoCmd("a > f | g", "cmd"), "echo a ^> f ^| g");
            assert.strictEqual(echoCmd('say "hi"', "cmd"), 'echo say ^"hi^"');
        });

        it("neutralises a quote in the message for every shell", () => {
            // cmd escapes it with ^; PowerShell and POSIX single quotes make it
            // literal already. The round-trip tests below prove the POSIX case
            // actually survives a real shell.
            assert.strictEqual(echoCmd('a"b', "cmd"), 'echo a^"b');
            assert.strictEqual(
                echoCmd('a"b', "powershell"),
                `Write-Host 'a"b'`
            );
            assert.strictEqual(echoCmd('a"b', "posix"), `printf '%s\\n' 'a"b'`);
        });

        it("does not let a message interpolate in powershell", () => {
            assert.strictEqual(
                echoCmd("cost is $100 $(whoami)", "powershell"),
                "Write-Host 'cost is $100 $(whoami)'"
            );
        });

        it("keeps a single quote from terminating the posix argument", () => {
            assert.strictEqual(
                echoCmd("it's", "posix"),
                `printf '%s\\n' 'it'\\''s'`
            );
        });
    });

    // The assertions above only prove we produce the string we intended. These
    // run the generated command through a real shell to prove the shell agrees.
    // CI runs Linux, macOS and Windows, so both suites below execute somewhere;
    // each skips itself on the platforms whose shells do not exist.
    describe("round-trip against a real posix shell", () => {
        // /bin/sh is guaranteed on every POSIX host, so its absence is a broken
        // environment rather than a reason to skip: silently passing would hide
        // this entire suite. zsh, bash and dash are probed individually.
        const requiredShell = "/bin/sh";

        before(function () {
            if (process.platform === "win32") {
                this.skip();
            }
            assert.ok(
                existsSync(requiredShell),
                `${requiredShell} is missing on a POSIX host; the round-trip suite cannot run`
            );
        });

        // sh is usually dash, zsh is the macOS default, and bash is what most
        // Linux users get. Their builtin `echo` and `read` differ, so each shell
        // has to be checked rather than assumed equivalent.
        const shells = [requiredShell, "/bin/zsh", "/bin/bash"];

        function skipUnlessPresent(ctx: Mocha.Context, shell: string) {
            if (shell !== requiredShell && !existsSync(shell)) {
                ctx.skip();
            }
        }

        async function run(shell: string, command: string): Promise<string> {
            const {stdout} = await execFileAsync(shell, ["-c", command]);
            return stdout;
        }

        const messages = [
            "plain message",
            'has "double quotes"',
            "has 'single quotes'",
            "has $HOME and `backticks`",
            "has & ampersand | pipe > gt < lt",
            "has \\ backslash",
            // \t and \c are the cases a builtin echo would mangle: a tab, and
            // "stop output" which truncated the whole line.
            "tab-ish /tmp/my\\test",
            "truncating /tmp/a\\class",
            "percent %s %d literal",
            "multi\nline\nmessage",
        ];

        shells.forEach((shell) => {
            messages.forEach((message) => {
                it(`prints ${JSON.stringify(
                    message
                )} verbatim in ${shell}`, async function () {
                    skipUnlessPresent(this, shell);
                    const stdout = await run(shell, echoCmd(message, "posix"));
                    assert.strictEqual(stdout, `${message}\n`);
                });
            });
        });

        const paths = [
            "/tmp/plain",
            "/tmp/with space",
            "/tmp/with'quote",
            '/tmp/with"dquote',
            "/tmp/with$var",
            "/tmp/with`tick`",
            "/tmp/with\\backslash",
            "/tmp/with$(whoami)subshell",
        ];

        shells.forEach((shell) => {
            paths.forEach((p) => {
                it(`passes ${JSON.stringify(
                    p
                )} as one argument in ${shell}`, async function () {
                    skipUnlessPresent(this, shell);
                    // printf %s\n prints each argument on its own line, so a path
                    // that got split shows up as more than one line.
                    const stdout = await run(
                        shell,
                        `printf '%s\\n' ${escapePathArgument(p, "posix")}`
                    );
                    assert.strictEqual(stdout, `${p}\n`);
                });
            });
        });

        // dash is the strictest of the bunch and the one that rejected bare
        // `read`; it is the default /bin/sh on Debian/Ubuntu but is not always
        // installed on macOS, so it is probed separately from `shells`.
        [...shells, "/bin/dash"].forEach((shell) => {
            it(`readCmd is accepted by ${shell}`, async function () {
                skipUnlessPresent(this, shell);
                // Regression: bare `read` is a usage error in dash ("arg count",
                // exit 2), so the hold-open step failed and the following `exit`
                // closed the terminal, hiding the CLI error it exists to keep
                // readable. Reading from /dev/null hits EOF immediately, so a
                // non-zero exit is expected; what matters is that the shell does
                // not complain about the syntax.
                const {stderr} = await execFileAsync(
                    shell,
                    ["-c", `${readCmd("posix")} < /dev/null`]
                    // A non-zero exit from EOF would reject the promise.
                ).catch((e: {stderr: string}) => e);
                assert.strictEqual(
                    stderr,
                    "",
                    `${shell} rejected ${readCmd("posix")}`
                );
            });
        });
    });

    // The cmd.exe and PowerShell branches are the ones #1822 was actually about,
    // and string equality alone is what let the original bug ship. The unit-test
    // matrix includes a windows-server runner, so they run for real here.
    //
    // Cases are batched into one shell invocation per assertion group: starting
    // a shell costs about a second, and more under CI endpoint scanning. See
    // windowsShellHarness for why cmd runs from a batch file rather than stdin.
    describe("round-trip against a real windows shell", function () {
        // Well past a cold shell start on a scanned CI runner; the harness
        // enforces its own per-spawn deadline, so this only has to not fire first.
        this.timeout(120_000);

        // `%` and `!` are excluded deliberately: cmd expands them even inside
        // quotes and has no interactive escape, which is a documented limit of
        // this module rather than something echoCmd promises — see
        // hasCmdUnsafeChars, and unsafeOutputDirReason for how callers refuse.
        const messages = [
            "plain message",
            'has "double quotes"',
            "has 'single quotes'",
            "has $HOME and `backticks`",
            "has & ampersand | pipe > gt < lt",
            "has ^ caret and (parens)",
            "has \\ backslash",
            "multi\nline\nmessage",
        ];

        // Windows paths cannot contain " < > | * ? :, so the awkward cases here
        // are the ones a real user can actually produce.
        const paths = [
            "C:\\tmp\\plain",
            "C:\\tmp\\with space",
            "C:\\tmp\\with'quote",
            "C:\\tmp\\with$var",
            "C:\\tmp\\with`tick",
            "C:\\tmp\\with&amp",
            "C:\\tmp\\with(paren)",
            "C:\\tmp\\with^caret",
            "C:\\tmp\\with;semi,comma=eq",
            "C:\\tmp\\with#hash@at+plus",
            "C:\\tmp\\with[bracket]",
        ];

        // Stands in for the real command line, which invokes databricks.exe or
        // python.exe with a quoted path: it proves the path survives the shell
        // *and* the Windows argv round-trip as one argument. The path under test
        // need not exist — only its spelling matters.
        let argvPrinter: ReturnType<typeof createArgvPrinter>;

        before(function () {
            if (process.platform !== "win32") {
                this.skip();
            }
            argvPrinter = createArgvPrinter();
        });

        after(() => argvPrinter?.dispose());

        (["cmd", "powershell"] as const).forEach((kind) => {
            describe(kind, () => {
                // Each group runs once in `before`, then the `it`s assert over
                // the collected output.
                let printed: string[][];
                let argv: string[][];

                before(async () => {
                    printed = await runWindowsCases(
                        kind,
                        messages.map((m) => echoCmd(m, kind))
                    );
                    argv = await runWindowsCases(
                        kind,
                        paths.map(
                            (p) =>
                                `${argvPrinter.invocation(
                                    kind
                                )} ${escapePathArgument(p, kind)}`
                        )
                    );
                });

                messages.forEach((message, i) => {
                    it(`prints ${JSON.stringify(message)} verbatim`, () => {
                        assert.deepStrictEqual(printed[i], message.split("\n"));
                    });
                });

                paths.forEach((p, i) => {
                    it(`passes ${JSON.stringify(p)} as one argument`, () => {
                        assert.deepStrictEqual(argv[i], [p]);
                    });
                });
            });
        });

        it("emits a blank line rather than the echo state in cmd.exe", async () => {
            // Regression: bare `echo` prints "ECHO is off." and `echo .` prints
            // a dot; only `echo.` prints an empty line.
            const [blank] = await runWindowsCases("cmd", [echoCmd("", "cmd")]);
            assert.deepStrictEqual(blank, [""]);
        });

        it("runs the whole chain in cmd.exe, hold-open step included", async () => {
            // `pause` returns at EOF on a closed stdin. What matters is that cmd
            // accepts every link: if any were unrecognised the chain would stop
            // there, and in the wizard the trailing `exit` would close the tab
            // and discard the CLI error the hold-open step exists to preserve.
            const command = [
                echoCmd("before", "cmd"),
                readCmd("cmd"),
                echoCmd("after", "cmd"),
            ].join(commandSeparator("cmd"));
            const [lines] = await runWindowsCases("cmd", [command]);
            const output = lines.join("\n");
            assert.ok(
                !output.includes("not recognized"),
                `cmd rejected part of ${command}: ${output}`
            );
            // "after" only prints if `pause` ran and returned.
            assert.ok(
                lines.includes("before") && lines.includes("after"),
                `chain did not run to completion: ${output}`
            );
        });

        it("parses the generated powershell command without executing it", async () => {
            // The failure mode #1822 describes for PowerShell is a *parse*
            // error: nothing runs at all, not even the trailing `exit`, so the
            // wizard hangs awaiting a terminal-close event. PowerShell's own
            // parser answers that directly, and unlike executing the line it
            // does not require Read-Host to have a console to read from.
            function parseErrorProbe(command: string): string {
                const quoted = escapePathArgument(command, "powershell");
                // @() forces a collection, so .Count is 0 rather than $null when
                // the parser reports no errors.
                return [
                    "$errs = $null",
                    `$null = [System.Management.Automation.Language.Parser]::ParseInput(${quoted}, [ref]$null, [ref]$errs)`,
                    "Write-Host @($errs).Count",
                ].join("; ");
            }

            function count(lines: string[]): number {
                const parsed = Number(lines.join("").trim());
                assert.ok(
                    Number.isInteger(parsed),
                    `could not read a parse-error count from: ${lines.join(
                        "|"
                    )}`
                );
                return parsed;
            }

            const powershellLine = [
                echoCmd("Press any key to close ...", "powershell"),
                readCmd("powershell"),
                "exit",
            ].join(commandSeparator("powershell"));
            // The same line shaped for cmd must *not* parse, which is why the
            // shell kind and the terminal's shell are resolved together.
            // Windows PowerShell (`powershell.exe`, 5.1 — what this suite runs)
            // rejects a bare `&`: "The ampersand (&) character is not allowed."
            // PowerShell 7 repurposed a trailing `&` as the background operator,
            // so if this is ever pointed at pwsh, expect to revisit the second
            // half of this assertion.
            const cmdLine = [
                echoCmd("Press any key to close ...", "cmd"),
                readCmd("cmd"),
                "exit",
            ].join(commandSeparator("cmd"));

            const [ok, bad] = await runWindowsCases("powershell", [
                parseErrorProbe(powershellLine),
                parseErrorProbe(cmdLine),
            ]);
            assert.strictEqual(count(ok), 0);
            assert.ok(
                count(bad) > 0,
                `a cmd-shaped line unexpectedly parsed in PowerShell: ${cmdLine}`
            );
        });
    });
});
