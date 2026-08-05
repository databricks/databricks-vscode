import assert from "assert";
import {execFile} from "child_process";
import {existsSync} from "fs";
import {promisify} from "util";
import {
    clearCmd,
    commandSeparator,
    detectShellKind,
    echoCmd,
    effectiveShellPath,
    escapeExecutableForTerminal,
    escapePathArgument,
    hasCmdUnsafeChars,
    readCmd,
    resolveProfileShellArgs,
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
    describe("resolveProfileShellArgs", () => {
        // env.shell reports the default profile's *path* only. VS Code builds a
        // fresh profile from an explicit executable and never fills args back
        // in, so pinning shellPath alone drops them.
        const wslProfiles = {
            "Ubuntu-22.04": {
                path: "wsl.exe",
                args: ["-d", "Ubuntu-22.04"],
            },
        };

        it("forwards the configured args for the default profile", () => {
            // Without this the terminal lands in the *default* distro, so
            // bundle init scaffolds into a different filesystem than the user
            // configured and getSubProjects then reports no projects found.
            assert.deepStrictEqual(
                resolveProfileShellArgs("wsl.exe", "Ubuntu-22.04", wslProfiles),
                ["-d", "Ubuntu-22.04"]
            );
        });

        it("matches the profile path case-insensitively and by basename", () => {
            assert.deepStrictEqual(
                resolveProfileShellArgs(
                    "C:\\Windows\\System32\\wsl.exe",
                    "Ubuntu-22.04",
                    wslProfiles
                ),
                ["-d", "Ubuntu-22.04"]
            );
        });

        it("forwards Git Bash's --login", () => {
            assert.deepStrictEqual(
                resolveProfileShellArgs(
                    "C:\\Program Files\\Git\\bin\\bash.exe",
                    "Git Bash",
                    {
                        "Git Bash": {
                            path: "C:\\Program Files\\Git\\bin\\bash.exe",
                            args: ["--login"],
                        },
                    }
                ),
                ["--login"]
            );
        });

        it("returns undefined when the profile is for a different shell", () => {
            // Passing another shell's args is worse than passing none: a
            // renamed or source-based profile can point at a different
            // executable than env.shell reports.
            assert.strictEqual(
                resolveProfileShellArgs(
                    "pwsh.exe",
                    "Ubuntu-22.04",
                    wslProfiles
                ),
                undefined
            );
        });

        it("returns undefined when there is nothing to forward", () => {
            assert.strictEqual(
                resolveProfileShellArgs("wsl.exe", undefined, wslProfiles),
                undefined
            );
            assert.strictEqual(
                resolveProfileShellArgs("wsl.exe", "Ubuntu-22.04", undefined),
                undefined
            );
            assert.strictEqual(
                resolveProfileShellArgs("pwsh.exe", "PowerShell", {
                    PowerShell: {path: "pwsh.exe"},
                }),
                undefined
            );
            // A null entry is how VS Code settings mark a profile as removed.
            assert.strictEqual(
                resolveProfileShellArgs("pwsh.exe", "PowerShell", {
                    PowerShell: null,
                }),
                undefined
            );
        });
    });

    describe("effectiveShellPath", () => {
        // When env.shell is empty the callers pass shellPath: undefined, so VS
        // Code launches the configured default profile. Guessing the platform
        // default instead can disagree with what actually starts, and a
        // mis-shaped line means nothing runs — not even the trailing `exit` —
        // leaving the wizard awaiting a terminal-close event forever.
        it("prefers env.shell when VS Code reports one", () => {
            assert.strictEqual(
                effectiveShellPath(
                    "/bin/zsh",
                    "Command Prompt",
                    {"Command Prompt": {path: "cmd.exe"}},
                    "C:\\Windows\\System32\\cmd.exe"
                ),
                "/bin/zsh"
            );
        });

        it("uses the configured default profile when env.shell is empty", () => {
            assert.strictEqual(
                detectShellKind(
                    effectiveShellPath(
                        "",
                        "Command Prompt",
                        {"Command Prompt": {path: "cmd.exe"}},
                        undefined
                    ),
                    "win32"
                ),
                "cmd"
            );
            // Git Bash as the default profile must resolve to posix, not to the
            // PowerShell a bare platform-default guess would assume.
            assert.strictEqual(
                detectShellKind(
                    effectiveShellPath(
                        "",
                        "Git Bash",
                        {
                            "Git Bash": {
                                path: "C:\\Program Files\\Git\\bin\\bash.exe",
                            },
                        },
                        undefined
                    ),
                    "win32"
                ),
                "posix"
            );
        });

        it("takes the first candidate when a profile lists several paths", () => {
            assert.strictEqual(
                effectiveShellPath(
                    "",
                    "PowerShell",
                    {PowerShell: {path: ["pwsh.exe", "powershell.exe"]}},
                    undefined
                ),
                "pwsh.exe"
            );
        });

        it("falls back to ComSpec, then to the platform default", () => {
            assert.strictEqual(
                effectiveShellPath("", undefined, undefined, "C:\\W\\cmd.exe"),
                "C:\\W\\cmd.exe"
            );
            // Nothing known at all: detectShellKind's platform default applies.
            assert.strictEqual(
                effectiveShellPath("", undefined, undefined, undefined),
                ""
            );
            assert.strictEqual(
                detectShellKind(
                    effectiveShellPath("", undefined, undefined, undefined),
                    "win32"
                ),
                "powershell"
            );
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
    // Gated on platform: /bin/sh is only guaranteed on POSIX hosts, and CI runs
    // Linux and macOS.
    describe("round-trip against a real shell", () => {
        const canRunPosix = process.platform !== "win32";

        // sh is usually dash, zsh is the macOS default, and bash is what most
        // Linux users get. Their builtin `echo` and `read` differ, so each shell
        // has to be checked rather than assumed equivalent.
        const shells = ["/bin/sh", "/bin/zsh", "/bin/bash"];

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
                    if (!canRunPosix || !existsSync(shell)) {
                        this.skip();
                    }
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
                    if (!canRunPosix || !existsSync(shell)) {
                        this.skip();
                    }
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
                if (!canRunPosix || !existsSync(shell)) {
                    this.skip();
                }
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
});
