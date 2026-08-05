import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "fs";
import {spawn} from "child_process";
import {tmpdir} from "os";
import path from "path";
import {
    escapeExecutableForTerminal,
    escapePathArgument,
} from "../utils/shellUtils";

/**
 * Runs generated command lines through a real cmd.exe or PowerShell, so tests
 * can check what the shell *does* rather than only what string we produced.
 * Windows-only; callers gate on `process.platform`.
 *
 * Why not pipe the commands to the shell's stdin, which is what
 * `terminal.sendText` does? Two reasons, both learned from CI:
 *
 * - cmd.exe echoes each line it reads from a non-console stdin, even after
 *   `@echo off`, so the command text lands in stdout next to its output.
 * - `pause` reads a keypress from that same stdin and swallows the first byte
 *   of the following line.
 *
 * cmd therefore runs from a batch file, where `@echo off` works as documented
 * and `pause` reads a stdin we close. The remaining divergence from an
 * interactive line is `%`: a batch file also treats `%%` as an escape and `%1`
 * as a parameter. Nothing here relies on that, because `%` cannot be passed
 * through cmd faithfully at all — see `hasCmdUnsafeChars`.
 *
 * PowerShell has neither problem and is fed on stdin, exactly as `sendText`
 * would.
 *
 * What the shell itself prints is ordered against the markers and can be read
 * from this stdout. What a *native command* prints is not — see
 * {@link createArgvPrinter}, which collects arguments through a file instead.
 */
export type WindowsShell = "cmd" | "powershell";

/** Bracketing markers, so one shell start can serve many cases. */
function beginMarker(index: number): string {
    return `@@BEGIN${index}@@`;
}

function endMarker(index: number): string {
    return `@@END${index}@@`;
}

function echoMarker(marker: string, shell: WindowsShell): string {
    return shell === "cmd" ? `echo ${marker}` : `Write-Host '${marker}'`;
}

/** Shells are slow to start, and slower under CI endpoint scanning. */
const SPAWN_TIMEOUT_MS = 60_000;

function spawnCollectingOutput(
    exe: string,
    args: string[],
    stdin: string
): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn(exe, args, {stdio: ["pipe", "pipe", "pipe"]});
        let output = "";
        // stderr is interleaved into the same buffer rather than dropped. A
        // command that fails prints only to stderr, so discarding it makes the
        // capture look simply empty and the assertion failure unreadable: the
        // reason is precisely what we need to see.
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => (output += chunk));
        child.stderr.on("data", (chunk) => (output += chunk));
        // Killed on a deadline rather than left to Mocha: a shell still waiting
        // for input would otherwise leak a process and report a bare timeout
        // instead of the output collected so far.
        const deadline = setTimeout(() => child.kill(), SPAWN_TIMEOUT_MS);
        child.on("error", (e) => {
            clearTimeout(deadline);
            reject(e);
        });
        child.on("close", () => {
            clearTimeout(deadline);
            resolve(output);
        });
        // Closing stdin lets `pause`/`read` return at EOF instead of blocking.
        child.stdin.end(stdin);
    });
}

/** Run `lines` as one script and return its raw stdout. */
export async function runWindowsScript(
    shell: WindowsShell,
    lines: string[]
): Promise<string> {
    if (shell === "powershell") {
        return spawnCollectingOutput(
            "powershell.exe",
            ["-NoProfile", "-NonInteractive", "-Command", "-"],
            `${lines.join("\n")}\n`
        );
    }
    const dir = mkdtempSync(path.join(tmpdir(), "dbx-shell-test-"));
    const script = path.join(dir, "run.bat");
    try {
        // cmd requires CRLF, and `@echo off` must be the first line.
        writeFileSync(script, ["@echo off", ...lines, ""].join("\r\n"));
        return await spawnCollectingOutput(
            process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe",
            ["/c", script],
            ""
        );
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
}

/**
 * A stand-in for the CLI: a script that records each argument it receives on its
 * own line, so a path that got split or expanded is visible as more or fewer
 * lines than expected.
 *
 * The script lives in a file rather than being passed to `node -e`. An inline
 * one-liner has to survive the shell's *own* quoting on the way in — and in
 * Windows PowerShell 5.1 native-command argument passing re-parses and re-quotes
 * what it forwards, so a bracketed one-liner is a second, unrelated variable in
 * a test whose subject is `escapePathArgument`. A file removes it: the only
 * awkward token left on the line is the path under test.
 *
 * Quoting the interpreter and the script path uses the module under test, which
 * is a deliberate trade: duplicating quoting rules in a test helper would let
 * the two drift. Both have their own direct unit tests, so a break there fails
 * those too rather than only showing up here.
 *
 * Arguments come back through a *file*, not the shell's stdout. A native process
 * writes to the inherited pipe itself, with its own buffering, so its output is
 * not ordered against the marker lines the shell prints around it: under
 * `powershell -Command -` it landed outside the markers altogether and every
 * case read back empty, with nothing on stderr to explain it. A file the process
 * finishes writing before it exits cannot be reordered that way.
 */
export function createArgvPrinter() {
    const dir = mkdtempSync(path.join(tmpdir(), "dbx-argv-printer-"));
    const script = path.join(dir, "printArgv.js");
    // Writes to the path given as the first argument; the arguments under test
    // follow it. argv[0] is node and argv[1] this script, so they start at 3.
    writeFileSync(
        script,
        [
            "const fs = require('fs');",
            "fs.writeFileSync(process.argv[2], process.argv.slice(3).join('\\n'));",
            "",
        ].join("\n")
    );

    function invocation(kind: WindowsShell, outFile: string): string {
        return [
            escapeExecutableForTerminal(process.execPath, kind),
            escapePathArgument(script, kind),
            escapePathArgument(outFile, kind),
        ].join(" ");
    }

    return {
        /**
         * The `node printArgv.js <outFile>` prefix for a caller assembling its
         * own command line; append the escaped argument(s) under test.
         */
        invocation(kind: WindowsShell, outFile: string): string {
            return invocation(kind, outFile);
        },

        /** Where {@link invocation}'s callee will write, for reading back. */
        outFileFor(name: string): string {
            return path.join(dir, `${name}.txt`);
        },

        /**
         * Run one case per argument in a single shell and return the arguments
         * each invocation actually received.
         */
        async collect(kind: WindowsShell, args: string[]): Promise<string[][]> {
            const outFiles = args.map((_, i) => path.join(dir, `out${i}.txt`));
            await runWindowsScript(
                kind,
                args.map(
                    (arg, i) =>
                        `${invocation(kind, outFiles[i])} ${escapePathArgument(
                            arg,
                            kind
                        )}`
                )
            );
            return outFiles.map((f) =>
                // A missing file means the command never ran at all, which is a
                // different failure from receiving the wrong arguments; keep them
                // distinguishable rather than reporting both as [].
                existsSync(f) ? readFileSync(f, "utf8").split("\n") : []
            );
        },

        dispose() {
            rmSync(dir, {recursive: true, force: true});
        },
    };
}

/**
 * Run every command in one shell invocation and return each one's output lines,
 * indexed as passed. Batched because a shell start costs about a second, and
 * these suites have dozens of cases.
 */
export async function runWindowsCases(
    shell: WindowsShell,
    commands: string[]
): Promise<string[][]> {
    const script = commands.flatMap((command, i) => [
        echoMarker(beginMarker(i), shell),
        command,
        echoMarker(endMarker(i), shell),
    ]);
    const stdout = await runWindowsScript(shell, script);
    return commands.map((_, i) => sliceCase(stdout, i, shell));
}

function sliceCase(
    stdout: string,
    index: number,
    shell: WindowsShell
): string[] {
    const lines = stdout.replaceAll("\r\n", "\n").split("\n");
    // cmd's `echo` prints everything up to a ` & ` separator, the space
    // included, so chained lines arrive with one trailing space. That is
    // cosmetic — it only affects a banner — and orthogonal to what these suites
    // measure, so it is normalised away here rather than asserted. No case
    // deliberately ends in a space.
    const normalise = (line: string) =>
        shell === "cmd" ? line.replace(/ +$/, "") : line;
    const from = lines.findIndex((l) => normalise(l) === beginMarker(index));
    const to = lines.findIndex(
        (l, i) => i > from && normalise(l) === endMarker(index)
    );
    if (from === -1 || to === -1) {
        throw new Error(
            `markers for case ${index} missing from ${shell} output:\n${stdout}`
        );
    }
    return lines.slice(from + 1, to).map(normalise);
}
