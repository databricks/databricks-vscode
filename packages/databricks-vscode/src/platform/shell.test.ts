import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
    commandSeparator,
    detectShellKind,
    echoLine,
    escapeExecutableForTerminal,
    escapePathArgument,
    escapePathArgumentForUnknownShell,
    hasCmdUnsafeChars,
    readCmd,
    runLineArgs,
    type ShellKind,
} from "./shell";

/**
 * Locate `fish` on `PATH`, or return `[]` when it isn't installed.
 *
 * fish is neither in the CI images nor preinstalled on macOS, so the round-trips
 * that use it must degrade to a skip rather than fail. Probing `PATH` (instead of
 * hardcoding a path) covers Homebrew's differing Intel and Apple Silicon
 * prefixes as well as Linux packages.
 */
function fishPath(): string[] {
    const probe = spawnSync(process.platform === "win32" ? "where" : "which", ["fish"]);
    if (probe.status !== 0) {
        return [];
    }
    const found = probe.stdout.toString().split("\n")[0]!.trim();
    return found === "" ? [] : [found];
}

describe("shellUtils", () => {
    describe("detectShellKind", () => {
        const cases: [string, NodeJS.Platform, ShellKind][] = [
            ["C:\\Windows\\System32\\cmd.exe", "win32", "cmd"],
            ["cmd.exe", "win32", "cmd"],
            [
                "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
                "win32",
                "powershell",
            ],
            // pwsh (PowerShell 6+) is the default on modern Windows and was
            // classified as posix before this fix, so it got POSIX `read`.
            ["C:\\Program Files\\PowerShell\\7\\pwsh.exe", "win32", "powershell"],
            ["pwsh", "darwin", "powershell"],
            ["pwsh-preview", "win32", "powershell"],
            ["C:\\Program Files\\Git\\bin\\bash.exe", "win32", "posix"],
            ["C:\\Windows\\System32\\wsl.exe", "win32", "posix"],
            ["/bin/bash", "linux", "posix"],
            ["/bin/zsh", "darwin", "posix"],
            ["/usr/bin/fish", "linux", "posix"],
            ["/bin/dash", "linux", "posix"],
            ["/bin/sh", "linux", "posix"],
        ];

        cases.forEach(([shell, platform, expected]) => {
            it(`classifies ${shell} on ${platform} as ${expected}`, () => {
                expect(detectShellKind(shell, platform)).toBe(expected);
            });
        });

        it("matches on the basename, not a substring of the path", () => {
            // "cmd" appears in the directory, but this is bash.
            expect(
                detectShellKind("C:\\cmder\\vendor\\git-for-windows\\bin\\bash.exe", "win32"),
            ).toBe("posix");
        });

        it("does not treat a windows shell name as windows-only", () => {
            expect(detectShellKind("/usr/local/bin/cmd", "linux")).toBe("cmd");
        });

        it("falls back to the platform default for an empty shell", () => {
            expect(detectShellKind("", "win32")).toBe("powershell");
            expect(detectShellKind("", "darwin")).toBe("posix");
            expect(detectShellKind("", "linux")).toBe("posix");
        });
    });

    describe("per-shell verbs", () => {
        it("runs a line non-interactively", () => {
            expect(runLineArgs("echo one& echo two", "cmd")).toBe('/d /s /c "echo one& echo two"');
            expect(runLineArgs("Write-Host 'é'", "powershell")).toEqual([
                "-NoLogo",
                "-NoProfile",
                "-EncodedCommand",
                Buffer.from("Write-Host 'é'", "utf16le").toString("base64"),
            ]);
            expect(runLineArgs("printf '%s\\n' one", "posix")).toEqual([
                "-c",
                "printf '%s\\n' one",
            ]);
        });

        it("waits for a key press", () => {
            expect(readCmd("cmd")).toBe("pause");
            expect(readCmd("powershell")).toBe("Read-Host");
            // An ordinary variable name is the only spelling every POSIX-ish
            // shell accepts: bare `read` is a usage error in dash, `read _` is
            // one in fish (`_` is read-only), and `-r` is not a fish flag. See
            // the round-trips below, which run this in each shell.
            expect(readCmd("posix")).toBe("read discard");
        });

        it("separates commands", () => {
            // No leading space: cmd's `echo` prints the rest of the line raw,
            // so `echo one & ...` would print "one" with a trailing space.
            expect(commandSeparator("cmd")).toBe("& ");
            expect(commandSeparator("powershell")).toBe("; ");
            expect(commandSeparator("posix")).toBe("; ");
        });
    });

    describe("escapePathArgument", () => {
        it("quotes plain paths", () => {
            expect(escapePathArgument("C:\\a b\\c", "cmd")).toBe('"C:\\a b\\c"');
            expect(escapePathArgument("C:\\a b\\c", "powershell")).toBe("'C:\\a b\\c'");
            expect(escapePathArgument("/a b/c", "posix")).toBe("'/a b/c'");
        });

        it("uses single quotes so powershell does not interpolate", () => {
            // With double quotes PowerShell would run `whoami` here.
            expect(escapePathArgument("C:\\a$(whoami)b", "powershell")).toBe("'C:\\a$(whoami)b'");
            // ...and would expand $RECYCLE to nothing.
            expect(escapePathArgument("C:\\Users\\me\\$RECYCLE.BIN", "powershell")).toBe(
                "'C:\\Users\\me\\$RECYCLE.BIN'",
            );
        });

        it("escapes every embedded quote, not just the first", () => {
            expect(escapePathArgument("/a'b'c", "posix")).toBe("'/a'\\''b'\\''c'");
            expect(escapePathArgument("C:\\a'b'c", "powershell")).toBe("'C:\\a''b''c'");
            expect(escapePathArgument('C:\\a"b"c', "cmd")).toBe('"C:\\a""b""c"');
        });

        it("leaves shell metacharacters literal", () => {
            expect(escapePathArgument("/a$VAR`x$(y)&z|w>v", "posix")).toBe("'/a$VAR`x$(y)&z|w>v'");
        });
    });

    describe("escapeExecutableForTerminal", () => {
        it("prefixes powershell with the call operator", () => {
            expect(escapeExecutableForTerminal("C:\\a b\\databricks.exe", "powershell")).toBe(
                "& 'C:\\a b\\databricks.exe'",
            );
        });

        it("just quotes elsewhere", () => {
            expect(escapeExecutableForTerminal("C:\\a b\\databricks.exe", "cmd")).toBe(
                '"C:\\a b\\databricks.exe"',
            );
            expect(escapeExecutableForTerminal("/opt/a b/databricks", "posix")).toBe(
                "'/opt/a b/databricks'",
            );
        });
    });

    describe("escapePathArgumentForUnknownShell", () => {
        // For reused terminals we can't know the dialect, so we keep main's
        // double quotes: they parse in cmd, PowerShell and POSIX alike. Single
        // quotes would break a cmd tab, which cmd reads as literal characters.
        it("uses double quotes so the line parses in any shell", () => {
            expect(escapePathArgumentForUnknownShell("C:\\Python\\python.exe")).toBe(
                '"C:\\Python\\python.exe"',
            );
            expect(escapePathArgumentForUnknownShell("/usr/bin/my python")).toBe(
                '"/usr/bin/my python"',
            );
        });

        it("escapes embedded double quotes", () => {
            expect(escapePathArgumentForUnknownShell('/a"b')).toBe('"/a\\"b"');
        });
    });

    describe("hasCmdUnsafeChars", () => {
        it("flags characters cmd expands inside quotes", () => {
            expect(hasCmdUnsafeChars("C:\\p%TEMP%q")).toBe(true);
            expect(hasCmdUnsafeChars("C:\\p!VAR!q")).toBe(true);
        });

        it("passes ordinary paths", () => {
            expect(hasCmdUnsafeChars("C:\\Users\\me\\project")).toBe(false);
            expect(hasCmdUnsafeChars("C:\\a b\\c-d_e.f")).toBe(false);
        });
    });

    describe("echoLine", () => {
        it("prints a line per shell", () => {
            expect(echoLine("hello world", "cmd")).toBe("echo hello world");
            expect(echoLine("hello world", "powershell")).toBe("Write-Host 'hello world'");
            // printf, not echo: zsh/dash `echo` interprets backslash escapes
            // even inside single quotes.
            expect(echoLine("hello world", "posix")).toBe("printf '%s\\n' 'hello world'");
        });

        it("escapes cmd's operators outside quotes with a caret", () => {
            // Unescaped, cmd parses these as operators rather than text, so it
            // tries to run the following word as a command.
            expect(echoLine("amp & pipe | gt > lt < paren ( )", "cmd")).toBe(
                "echo amp ^& pipe ^| gt ^> lt ^< paren ^( ^)",
            );
            // `^` is the escape character, so it escapes itself.
            expect(echoLine("caret ^ here", "cmd")).toBe("echo caret ^^ here");
            // The other shells quote instead, so they need no caret.
            expect(echoLine("amp & pipe |", "posix")).toBe("printf '%s\\n' 'amp & pipe |'");
        });

        it("leaves cmd's operators alone inside quotes", () => {
            // This is the shape the bundle-init banner actually has: an already
            // double-quoted path. cmd treats operators inside quotes as text, and
            // a `^` there would *print*, so the quoted run must pass through
            // untouched while operators outside it are still escaped.
            expect(
                echoLine('Executing: databricks bundle init --output-dir "C:\\a&b\\proj"', "cmd"),
            ).toBe('echo Executing: databricks bundle init --output-dir "C:\\a&b\\proj"');
            expect(echoLine('before & "in&side" after & x', "cmd")).toBe(
                'echo before ^& "in&side" after ^& x',
            );
        });

        it("prints a blank line", () => {
            expect(echoLine("", "cmd")).toBe("echo.");
            expect(echoLine("", "posix")).toBe("printf '%s\\n' ''");
        });
    });

    // fish is included because it is *not* strictly POSIX: it rejects
    // `read _` (`_` is read-only) and treats `\` inside single quotes as an
    // escape. It ships in neither CI image nor macOS, so it is probed for on
    // `PATH` rather than at a fixed location.
    const shells = ["/bin/sh", "/bin/bash", "/bin/zsh", "/bin/dash", ...fishPath()].filter((s) =>
        existsSync(s),
    );

    // None on Windows; a suite without tests is an error.
    describe.skipIf(shells.length === 0)("posix round-trip through real shells", () => {
        const awkward = [
            "plain",
            "with spaces",
            "it's quoted",
            'double "quotes"',
            "$VAR and ${BRACED}",
            "$(whoami) and `id`",
            "amp & pipe | redirect > semi ;",
            "back\\slash and \\t tab-ish",
            // fish reads \\ and \' as escapes inside single quotes.
            "two\\\\slashes and a trailing \\",
            "x\\'; echo injected #",
            "percent %s %d",
            "tilde ~ star * question ?",
        ];

        shells.forEach((shell) => {
            it(`echoLine round-trips verbatim in ${shell}`, () => {
                awkward.forEach((message) => {
                    const out = execFileSync(shell, ["-c", echoLine(message, "posix")], {
                        encoding: "utf8",
                        stdio: ["ignore", "pipe", "pipe"],
                    });
                    expect(out).toBe(`${message}\n`);
                });
            });

            it(`escapePathArgument round-trips verbatim in ${shell}`, () => {
                awkward.forEach((arg) => {
                    // `printf %s` on the escaped argument: if quoting is wrong
                    // the shell splits, expands, or fails to parse.
                    const out = execFileSync(
                        shell,
                        ["-c", `printf '%s' ${escapePathArgument(arg, "posix")}`],
                        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
                    );
                    expect(out).toBe(arg);
                });
            });

            it(`readCmd is not a usage error in ${shell}`, () => {
                // With stdin at EOF, `read` legitimately fails (exit 1). What
                // must not happen is a *usage* error: bare `read` in dash is
                // "read: arg count", exit 2, and `read _` in fish is
                // "cannot overwrite read-only variable", also exit 2. That fails
                // the hold-open step, so the following `exit` closes the
                // terminal and discards the CLI error we were keeping on screen.
                const result = spawnSync(shell, ["-c", readCmd("posix")], {
                    encoding: "utf8",
                    stdio: ["ignore", "pipe", "pipe"],
                });
                expect(result.stderr).toBe("");
                expect(result.status).not.toBe(2);
            });

            it(`readCmd consumes a line silently in ${shell}`, () => {
                // The pause must swallow the keypress, not print it. Bare `read`
                // in fish exits 0 with empty stderr — so the usage-error check
                // above passes — yet echoes the line back, corrupting the
                // terminal with a stray copy of whatever the user typed.
                const result = spawnSync(shell, ["-c", readCmd("posix")], {
                    encoding: "utf8",
                    input: "keypress\n",
                });
                expect(result.stdout).toBe("");
                expect(result.stderr).toBe("");
                expect(result.status).toBe(0);
            });
        });
    });
});
