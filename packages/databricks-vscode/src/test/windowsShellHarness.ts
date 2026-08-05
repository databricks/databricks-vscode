import {mkdtempSync, rmSync, writeFileSync} from "fs";
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
 * A stand-in for the CLI: a script that prints each argument it receives on its
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
 */
export function createArgvPrinter() {
    const dir = mkdtempSync(path.join(tmpdir(), "dbx-argv-printer-"));
    const script = path.join(dir, "printArgv.js");
    // argv[0] is node, argv[1] this script, so the arguments start at 2.
    writeFileSync(
        script,
        "process.argv.slice(2).forEach((a) => console.log(a));\n"
    );
    return {
        /** The `node printArgv.js` prefix; append the escaped argument(s). */
        invocation(kind: WindowsShell): string {
            return [
                escapeExecutableForTerminal(process.execPath, kind),
                escapePathArgument(script, kind),
            ].join(" ");
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
