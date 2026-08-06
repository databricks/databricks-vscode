import {expect} from "chai";
import {execFileSync, spawnSync} from "node:child_process";
import {existsSync, mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {
    clearCmd,
    commandSeparator,
    detectShellKind,
    echoLine,
    escapeExecutableForTerminal,
    escapePathArgument,
    escapePathArgumentForUnknownShell,
    hasCmdUnsafeChars,
    readCmd,
    ShellKind,
} from "./shellUtils";

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
            [
                "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
                "win32",
                "powershell",
            ],
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
                expect(detectShellKind(shell, platform)).to.equal(expected);
            });
        });

        it("matches on the basename, not a substring of the path", () => {
            // "cmd" appears in the directory, but this is bash.
            expect(
                detectShellKind(
                    "C:\\cmder\\vendor\\git-for-windows\\bin\\bash.exe",
                    "win32"
                )
            ).to.equal("posix");
        });

        it("does not treat a windows shell name as windows-only", () => {
            expect(detectShellKind("/usr/local/bin/cmd", "linux")).to.equal(
                "cmd"
            );
        });

        it("falls back to the platform default for an empty shell", () => {
            expect(detectShellKind("", "win32")).to.equal("powershell");
            expect(detectShellKind("", "darwin")).to.equal("posix");
            expect(detectShellKind("", "linux")).to.equal("posix");
        });
    });

    describe("per-shell verbs", () => {
        it("clears the screen", () => {
            expect(clearCmd("cmd")).to.equal("cls");
            expect(clearCmd("powershell")).to.equal("Clear-Host");
            expect(clearCmd("posix")).to.equal("clear");
        });

        it("waits for a key press", () => {
            expect(readCmd("cmd")).to.equal("pause");
            expect(readCmd("powershell")).to.equal("Read-Host");
            // Bare `read` is a usage error in dash; `read _` works everywhere.
            expect(readCmd("posix")).to.equal("read _");
        });

        it("separates commands", () => {
            // No leading space: cmd's `echo` prints the rest of the line raw,
            // so `echo one & ...` would print "one" with a trailing space.
            expect(commandSeparator("cmd")).to.equal("& ");
            expect(commandSeparator("powershell")).to.equal("; ");
            expect(commandSeparator("posix")).to.equal("; ");
        });
    });

    describe("escapePathArgument", () => {
        it("quotes plain paths", () => {
            expect(escapePathArgument("C:\\a b\\c", "cmd")).to.equal(
                '"C:\\a b\\c"'
            );
            expect(escapePathArgument("C:\\a b\\c", "powershell")).to.equal(
                "'C:\\a b\\c'"
            );
            expect(escapePathArgument("/a b/c", "posix")).to.equal("'/a b/c'");
        });

        it("uses single quotes so powershell does not interpolate", () => {
            // With double quotes PowerShell would run `whoami` here.
            expect(
                escapePathArgument("C:\\a$(whoami)b", "powershell")
            ).to.equal("'C:\\a$(whoami)b'");
            // ...and would expand $RECYCLE to nothing.
            expect(
                escapePathArgument("C:\\Users\\me\\$RECYCLE.BIN", "powershell")
            ).to.equal("'C:\\Users\\me\\$RECYCLE.BIN'");
        });

        it("escapes every embedded quote, not just the first", () => {
            expect(escapePathArgument("/a'b'c", "posix")).to.equal(
                "'/a'\\''b'\\''c'"
            );
            expect(escapePathArgument("C:\\a'b'c", "powershell")).to.equal(
                "'C:\\a''b''c'"
            );
            expect(escapePathArgument('C:\\a"b"c', "cmd")).to.equal(
                '"C:\\a""b""c"'
            );
        });

        it("leaves shell metacharacters literal", () => {
            expect(escapePathArgument("/a$VAR`x$(y)&z|w>v", "posix")).to.equal(
                "'/a$VAR`x$(y)&z|w>v'"
            );
        });
    });

    describe("escapeExecutableForTerminal", () => {
        it("prefixes powershell with the call operator", () => {
            expect(
                escapeExecutableForTerminal(
                    "C:\\a b\\databricks.exe",
                    "powershell"
                )
            ).to.equal("& 'C:\\a b\\databricks.exe'");
        });

        it("just quotes elsewhere", () => {
            expect(
                escapeExecutableForTerminal("C:\\a b\\databricks.exe", "cmd")
            ).to.equal('"C:\\a b\\databricks.exe"');
            expect(
                escapeExecutableForTerminal("/opt/a b/databricks", "posix")
            ).to.equal("'/opt/a b/databricks'");
        });
    });

    describe("escapePathArgumentForUnknownShell", () => {
        // For reused terminals we can't know the dialect, so we keep main's
        // double quotes: they parse in cmd, PowerShell and POSIX alike. Single
        // quotes would break a cmd tab, which cmd reads as literal characters.
        it("uses double quotes so the line parses in any shell", () => {
            expect(
                escapePathArgumentForUnknownShell("C:\\Python\\python.exe")
            ).to.equal('"C:\\Python\\python.exe"');
            expect(
                escapePathArgumentForUnknownShell("/usr/bin/my python")
            ).to.equal('"/usr/bin/my python"');
        });

        it("escapes embedded double quotes", () => {
            expect(escapePathArgumentForUnknownShell('/a"b')).to.equal(
                '"/a\\"b"'
            );
        });
    });

    describe("hasCmdUnsafeChars", () => {
        it("flags characters cmd expands inside quotes", () => {
            expect(hasCmdUnsafeChars("C:\\p%TEMP%q")).to.equal(true);
            expect(hasCmdUnsafeChars("C:\\p!VAR!q")).to.equal(true);
        });

        it("passes ordinary paths", () => {
            expect(hasCmdUnsafeChars("C:\\Users\\me\\project")).to.equal(false);
            expect(hasCmdUnsafeChars("C:\\a b\\c-d_e.f")).to.equal(false);
        });
    });

    describe("echoLine", () => {
        it("prints a line per shell", () => {
            expect(echoLine("hello world", "cmd")).to.equal("echo hello world");
            expect(echoLine("hello world", "powershell")).to.equal(
                "Write-Host 'hello world'"
            );
            // printf, not echo: zsh/dash `echo` interprets backslash escapes
            // even inside single quotes.
            expect(echoLine("hello world", "posix")).to.equal(
                "printf '%s\\n' 'hello world'"
            );
        });

        it("escapes cmd's operators outside quotes with a caret", () => {
            // Unescaped, cmd parses these as operators rather than text, so it
            // tries to run the following word as a command.
            expect(
                echoLine("amp & pipe | gt > lt < paren ( )", "cmd")
            ).to.equal("echo amp ^& pipe ^| gt ^> lt ^< paren ^( ^)");
            // `^` is the escape character, so it escapes itself.
            expect(echoLine("caret ^ here", "cmd")).to.equal(
                "echo caret ^^ here"
            );
            // The other shells quote instead, so they need no caret.
            expect(echoLine("amp & pipe |", "posix")).to.equal(
                "printf '%s\\n' 'amp & pipe |'"
            );
        });

        it("leaves cmd's operators alone inside quotes", () => {
            // This is the shape the bundle-init banner actually has: an already
            // double-quoted path. cmd treats operators inside quotes as text, and
            // a `^` there would *print*, so the quoted run must pass through
            // untouched while operators outside it are still escaped.
            expect(
                echoLine(
                    'Executing: databricks bundle init --output-dir "C:\\a&b\\proj"',
                    "cmd"
                )
            ).to.equal(
                'echo Executing: databricks bundle init --output-dir "C:\\a&b\\proj"'
            );
            expect(echoLine('before & "in&side" after & x', "cmd")).to.equal(
                'echo before ^& "in&side" after ^& x'
            );
        });

        it("prints a blank line", () => {
            expect(echoLine("", "cmd")).to.equal("echo.");
            expect(echoLine("", "posix")).to.equal("printf '%s\\n' ''");
        });
    });

    describe("the bundle init command line", () => {
        // Mirrors what BundleInitWizard assembles, so the shipped string for
        // each shell is reviewable here.
        function bundleInitCommand(
            cliPath: string,
            outputDir: string,
            kind: ShellKind
        ): string {
            const args = [
                "bundle",
                "init",
                "--output-dir",
                escapePathArgument(outputDir, kind),
            ].join(" ");
            return [
                clearCmd(kind),
                echoLine(`Executing: databricks ${args}`, kind),
                echoLine(
                    "Follow the steps below to create your new Databricks project.",
                    kind
                ),
                echoLine("", kind),
                `${escapeExecutableForTerminal(cliPath, kind)} ${args}`,
                echoLine("", kind),
                echoLine(
                    "Press any key to close the terminal and continue ...",
                    kind
                ),
                readCmd(kind),
                "exit",
            ].join(commandSeparator(kind));
        }

        it("is valid cmd (the #1822 case)", () => {
            expect(
                bundleInitCommand(
                    "C:\\ext\\bin\\databricks.exe",
                    "C:\\Users\\me\\proj",
                    "cmd"
                )
            ).to.equal(
                'cls& echo Executing: databricks bundle init --output-dir "C:\\Users\\me\\proj"& ' +
                    "echo Follow the steps below to create your new Databricks project.& echo.& " +
                    '"C:\\ext\\bin\\databricks.exe" bundle init --output-dir "C:\\Users\\me\\proj"& ' +
                    "echo.& echo Press any key to close the terminal and continue ...& pause& exit"
            );
        });

        it("is valid powershell", () => {
            expect(
                bundleInitCommand(
                    "C:\\ext\\bin\\databricks.exe",
                    "C:\\Users\\me\\proj",
                    "powershell"
                )
            ).to.equal(
                "Clear-Host; Write-Host 'Executing: databricks bundle init --output-dir ''C:\\Users\\me\\proj'''; " +
                    "Write-Host 'Follow the steps below to create your new Databricks project.'; Write-Host ''; " +
                    "& 'C:\\ext\\bin\\databricks.exe' bundle init --output-dir 'C:\\Users\\me\\proj'; " +
                    "Write-Host ''; Write-Host 'Press any key to close the terminal and continue ...'; Read-Host; exit"
            );
        });

        it("is valid posix", () => {
            expect(
                bundleInitCommand("/opt/databricks", "/home/me/proj", "posix")
            ).to.equal(
                "clear; printf '%s\\n' 'Executing: databricks bundle init --output-dir '\\''/home/me/proj'\\'''; " +
                    "printf '%s\\n' 'Follow the steps below to create your new Databricks project.'; printf '%s\\n' ''; " +
                    "'/opt/databricks' bundle init --output-dir '/home/me/proj'; " +
                    "printf '%s\\n' ''; printf '%s\\n' 'Press any key to close the terminal and continue ...'; read _; exit"
            );
        });
    });

    describe("the az login command line", () => {
        // Mirrors what AzureCliCheck assembles. Same hardcoded-POSIX defect as
        // the bundle init line: `;` and `echo` are not cmd syntax, so `az login`
        // was broken on cmd.exe too.
        function azLoginCommand(
            azBinPath: string,
            tenant: string,
            useDeviceCode: boolean,
            kind: ShellKind
        ): string {
            const args = [
                "login",
                "--allow-no-subscriptions",
                ...(useDeviceCode ? ["--use-device-code"] : []),
                ...(tenant ? ["-t", escapePathArgument(tenant, kind)] : []),
            ].join(" ");
            return [
                `${escapeExecutableForTerminal(azBinPath, kind)} ${args}`,
                echoLine(
                    "Press any key to close the terminal and continue ...",
                    kind
                ),
                readCmd(kind),
                "exit",
            ].join(commandSeparator(kind));
        }

        const tenant = "72f988bf-86f1-41af-91ab-2d7cd011db47";

        it("is valid cmd", () => {
            expect(azLoginCommand("az", tenant, false, "cmd")).to.equal(
                `"az" login --allow-no-subscriptions -t "${tenant}"& ` +
                    "echo Press any key to close the terminal and continue ...& pause& exit"
            );
        });

        it("is valid powershell", () => {
            expect(azLoginCommand("az", tenant, false, "powershell")).to.equal(
                `& 'az' login --allow-no-subscriptions -t '${tenant}'; ` +
                    "Write-Host 'Press any key to close the terminal and continue ...'; Read-Host; exit"
            );
        });

        it("is valid posix", () => {
            expect(azLoginCommand("az", tenant, false, "posix")).to.equal(
                `'az' login --allow-no-subscriptions -t '${tenant}'; ` +
                    "printf '%s\\n' 'Press any key to close the terminal and continue ...'; read _; exit"
            );
        });

        it("omits the tenant flag when there is no tenant", () => {
            expect(azLoginCommand("az", "", false, "posix")).to.equal(
                "'az' login --allow-no-subscriptions; " +
                    "printf '%s\\n' 'Press any key to close the terminal and continue ...'; read _; exit"
            );
        });

        it("adds --use-device-code in codespaces", () => {
            expect(azLoginCommand("az", "", true, "posix")).to.contain(
                "login --allow-no-subscriptions --use-device-code;"
            );
        });

        it("quotes an absolute az path with spaces", () => {
            expect(
                azLoginCommand(
                    "C:\\Program Files\\Azure CLI\\az.cmd",
                    "",
                    false,
                    "cmd"
                )
            ).to.contain('"C:\\Program Files\\Azure CLI\\az.cmd" login');
        });

        it("quotes the tenant, which comes from a token claim", () => {
            // Not attacker-controlled in practice, but it is external data
            // reaching a command line, so it must not be able to inject.
            expect(
                azLoginCommand("az", "a'b$(id)c", false, "posix")
            ).to.contain("-t 'a'\\''b$(id)c'");
        });
    });

    // String equality only proves we built what we intended, not that a shell
    // agrees. Run the generated POSIX fragments through real shells and check
    // the output byte for byte.
    describe("posix round-trip through real shells", () => {
        const shells = ["/bin/sh", "/bin/bash", "/bin/zsh", "/bin/dash"].filter(
            (s) => existsSync(s)
        );

        const awkward = [
            "plain",
            "with spaces",
            "it's quoted",
            'double "quotes"',
            "$VAR and ${BRACED}",
            "$(whoami) and `id`",
            "amp & pipe | redirect > semi ;",
            "back\\slash and \\t tab-ish",
            "percent %s %d",
            "tilde ~ star * question ?",
        ];

        shells.forEach((shell) => {
            it(`echoLine round-trips verbatim in ${shell}`, () => {
                awkward.forEach((message) => {
                    const out = execFileSync(
                        shell,
                        ["-c", echoLine(message, "posix")],
                        {encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}
                    );
                    expect(out).to.equal(`${message}\n`);
                });
            });

            it(`escapePathArgument round-trips verbatim in ${shell}`, () => {
                awkward.forEach((arg) => {
                    // `printf %s` on the escaped argument: if quoting is wrong
                    // the shell splits, expands, or fails to parse.
                    const out = execFileSync(
                        shell,
                        [
                            "-c",
                            `printf '%s' ${escapePathArgument(arg, "posix")}`,
                        ],
                        {encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}
                    );
                    expect(out).to.equal(arg);
                });
            });

            it(`readCmd is not a usage error in ${shell}`, () => {
                // With stdin at EOF, `read` legitimately fails (exit 1). What
                // must not happen is a *usage* error: bare `read` in dash is
                // "read: arg count", exit 2, printed to stderr. That fails the
                // hold-open step, so the following `exit` closes the terminal
                // and discards the CLI error we were keeping on screen.
                const result = spawnSync(shell, ["-c", readCmd("posix")], {
                    encoding: "utf8",
                    stdio: ["ignore", "pipe", "pipe"],
                });
                expect(result.stderr).to.equal("");
                expect(result.status).to.not.equal(2);
            });
        });
    });

    // The cmd/PowerShell half of the round-trip layer. These are the shells
    // #1822 is actually about, so without them those branches are only covered
    // by string equality — which cannot catch a verb that doesn't exist or
    // quoting the shell disagrees with.
    //
    // cmd only exists on Windows (the CI matrix has a windows-server-latest
    // runner). PowerShell is probed for rather than gated on the platform, so
    // these also run wherever `pwsh` is installed, including Linux and macOS.
    describe("cmd and powershell round-trip through real shells", () => {
        const onWindows = process.platform === "win32";

        // Paths cmd and PowerShell accept literally: no `%`/`!` (cmd expands
        // those and we reject them upstream), no chars illegal in NTFS names.
        const awkwardWinPaths = [
            "C:\\plain\\proj",
            "C:\\with spaces\\my proj",
            "C:\\a'b\\quoted",
            "C:\\a$VAR\\dollar",
            "C:\\a(paren)b\\proj",
            "C:\\a&b\\amp",
            "C:\\a;b\\semi",
        ];

        const awkwardMessages = [
            "plain",
            "with spaces",
            "it's quoted",
            "$VAR and $(cmd)",
            "amp & pipe | redirect > caret ^",
            "paren (grouped) and `backtick`",
        ];

        /**
         * Drop stderr output that says nothing about whether our command line
         * was correct.
         *
         * `Clear-Host` on Linux shells out to `clear`, which needs `$TERM`;
         * under CI there is no TTY, so it warns. The command still parses and
         * still exits 0 — asserting raw-empty stderr would fail on the
         * environment rather than on the code under test.
         */
        function stripBenignStderr(stderr: string): string {
            return stderr
                .split(/\r?\n/)
                .filter(
                    (line) =>
                        line.trim() !== "" &&
                        !/TERM environment variable not set/i.test(line)
                )
                .join("\n");
        }

        describe("cmd", function () {
            // Each case spawns cmd.exe and writes a temp file, so the 2s default
            // is too tight on a loaded Windows runner.
            this.timeout(60_000);

            const cmdIt = onWindows ? it : it.skip;

            // Run a generated line through cmd via a temp .cmd file rather than
            // `cmd /c <line>`: passing it as an argv entry would let Node apply
            // its own Windows quoting, which escapes an embedded `"` as `\"` —
            // a sequence cmd does not understand, so the test would be
            // measuring Node's escaping instead of ours.
            function runCmd(line: string): string {
                const file = path.join(
                    mkdtempSync(path.join(tmpdir(), "shellutils-")),
                    "run.cmd"
                );
                writeFileSync(file, `@echo off\r\n${line}\r\n`);
                try {
                    const result = spawnSync("cmd.exe", ["/d", "/c", file], {
                        encoding: "utf8",
                        stdio: ["pipe", "pipe", "pipe"],
                        input: "",
                    });
                    expect(stripBenignStderr(result.stderr)).to.equal("");
                    expect(result.status).to.equal(0);
                    return result.stdout;
                } finally {
                    rmSync(path.dirname(file), {
                        recursive: true,
                        force: true,
                    });
                }
            }

            cmdIt("echoLine prints each message verbatim", () => {
                awkwardMessages.forEach((message) => {
                    expect(
                        runCmd(echoLine(message, "cmd")).replace(/\r?\n$/, "")
                    ).to.equal(message);
                });
            });

            cmdIt("echoLine('') prints a blank line", () => {
                // Plain `echo` would print "ECHO is off." instead.
                expect(runCmd(echoLine("", "cmd"))).to.equal("\r\n");
            });

            cmdIt("escapePathArgument stays one literal argument", () => {
                awkwardWinPaths.forEach((p) => {
                    // Echo the quoted path back through cmd. If the quoting is
                    // wrong, `&`/`;`/spaces split it or cmd reports a parse
                    // error, which runCmd's status/stderr assertions catch.
                    const out = runCmd(
                        `echo ${escapePathArgument(p, "cmd")}`
                    ).replace(/\r?\n$/, "");
                    // cmd's `echo` keeps the quotes it was given.
                    expect(out).to.equal(`"${p}"`);
                });
            });

            cmdIt("the command separator chains commands", () => {
                const line = ["echo one", "echo two"].join(
                    commandSeparator("cmd")
                );
                expect(runCmd(line).replace(/\r\n/g, "\n")).to.equal(
                    "one\ntwo\n"
                );
            });

            cmdIt("clearCmd and readCmd are real cmd verbs", () => {
                // `cls` and `pause` are the two verbs #1822 got wrong: the
                // POSIX `clear`/`read` it sent don't exist here. runCmd
                // asserts exit 0 and empty stderr, which is what a
                // "not recognized as an internal or external command" would
                // violate. `pause` gets EOF on stdin so it can't hang.
                runCmd(clearCmd("cmd"));
                runCmd(readCmd("cmd"));
            });
        });

        describe("powershell", function () {
            // A PowerShell cold start is ~0.5-1s, an order of magnitude slower
            // than the POSIX shells above, so the 2s default is not enough even
            // for a couple of spawns on a loaded CI runner.
            this.timeout(60_000);

            // Prefer pwsh (6+, cross-platform) wherever it's on PATH, and fall
            // back to the built-in Windows PowerShell. Probing rather than
            // checking the platform means a machine with pwsh installed runs
            // these for real instead of skipping — the Linux CI runner has it.
            const psExe = ((): string | undefined => {
                for (const candidate of ["pwsh", "powershell.exe"]) {
                    const probe = spawnSync(
                        candidate,
                        ["-NoProfile", "-Command", "exit 0"],
                        {
                            stdio: "ignore",
                        }
                    );
                    if (!probe.error && probe.status === 0) {
                        return candidate;
                    }
                }
                return undefined;
            })();
            const psIt = psExe ? it : it.skip;

            /**
             * Run one PowerShell script and return its stdout lines.
             *
             * Batching every case into a single invocation keeps these tests
             * off the per-spawn startup cost, and joining with our own
             * `commandSeparator` means the separator is exercised too.
             */
            function runPs(commands: string[]): string[] {
                const result = spawnSync(
                    psExe!,
                    [
                        "-NoProfile",
                        "-Command",
                        commands.join(commandSeparator("powershell")),
                    ],
                    {encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}
                );
                expect(stripBenignStderr(result.stderr)).to.equal("");
                expect(result.status).to.equal(0);
                return result.stdout.replace(/\r?\n$/, "").split(/\r?\n/);
            }

            psIt("echoLine prints each message verbatim", () => {
                expect(
                    runPs(awkwardMessages.map((m) => echoLine(m, "powershell")))
                ).to.deep.equal(awkwardMessages);
            });

            psIt("escapePathArgument does not interpolate", () => {
                // Single quotes are literal in PowerShell; with double quotes
                // `$VAR` would vanish and `$(cmd)` would execute.
                expect(
                    runPs(
                        awkwardWinPaths.map(
                            (p) =>
                                `Write-Host ${escapePathArgument(
                                    p,
                                    "powershell"
                                )}`
                        )
                    )
                ).to.deep.equal(awkwardWinPaths);
            });

            psIt("escapeExecutableForTerminal invokes the executable", () => {
                // The `&` call operator is what makes a quoted path run rather
                // than just echo back as a string.
                expect(
                    runPs([
                        `${escapeExecutableForTerminal(
                            process.execPath,
                            "powershell"
                        )} -e "process.stdout.write('ran')"`,
                    ])
                ).to.deep.equal(["ran"]);
            });

            psIt("clearCmd resolves as a PowerShell command", () => {
                // Ask PowerShell to resolve the verb rather than run it. Running
                // it proves little: `clear` is also a valid command on Linux
                // pwsh, so a POSIX verb leaking into the PowerShell branch would
                // still exit 0 here, and whether Clear-Host emits its escape
                // sequences depends on the detected terminal capabilities (they
                // appear with $TERM set, and not on a TTY-less CI runner).
                // Assert on the resolved name only. The command *type* varies
                // (Clear-Host is a Function in pwsh 7 but a Cmdlet in Windows
                // PowerShell 5), whereas a POSIX `clear` leaking into this
                // branch resolves to an Application named `clear` on Linux and
                // fails to resolve at all on Windows.
                expect(
                    runPs([
                        `(Get-Command ${clearCmd(
                            "powershell"
                        )}).Name.ToString()`,
                    ])
                ).to.deep.equal([clearCmd("powershell")]);
            });

            psIt("the separator does not swallow what follows", () => {
                // Deliberately not `Clear-Host` here: with no console attached
                // it throws "The handle is invalid" on Windows, which is about
                // the runner's environment rather than our command line. Its
                // resolution is covered by the test above.
                expect(
                    runPs(["Write-Host first", "Write-Host ok"])
                ).to.deep.equal(["first", "ok"]);
            });
        });
    });
});
