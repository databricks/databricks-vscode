import assert from "assert";
import {execFile} from "child_process";
import {promisify} from "util";
import {
    buildBundleInitCommand,
    unsafeOutputDirReason,
} from "./bundleInitCommand";
import {escapeExecutableForTerminal} from "../utils/shellUtils";

const execFileAsync = promisify(execFile);

describe(__filename, () => {
    describe("buildBundleInitCommand", () => {
        it("builds the command for posix shells", () => {
            const command = buildBundleInitCommand(
                escapeExecutableForTerminal("/usr/bin/databricks", "posix"),
                "/home/me/projects",
                "posix"
            );
            assert.strictEqual(
                command,
                "clear; " +
                    `printf '%s\\n' 'Executing: databricks bundle init --output-dir '\\''/home/me/projects'\\'''; ` +
                    `printf '%s\\n' 'Follow the steps below to create your new Databricks project.'; ` +
                    `printf '%s\\n' ''; ` +
                    `'/usr/bin/databricks' bundle init --output-dir '/home/me/projects'; ` +
                    `printf '%s\\n' ''; ` +
                    `printf '%s\\n' 'Press any key to close the terminal and continue ...'; ` +
                    "read _; " +
                    "exit"
            );
        });

        it("builds the command for powershell", () => {
            const command = buildBundleInitCommand(
                escapeExecutableForTerminal(
                    "C:\\Program Files\\databricks.exe",
                    "powershell"
                ),
                "C:\\Users\\me\\projects",
                "powershell"
            );
            assert.strictEqual(
                command,
                "Clear-Host; " +
                    `Write-Host 'Executing: databricks bundle init --output-dir ''C:\\Users\\me\\projects'''; ` +
                    `Write-Host 'Follow the steps below to create your new Databricks project.'; ` +
                    `Write-Host ''; ` +
                    `& 'C:\\Program Files\\databricks.exe' bundle init --output-dir 'C:\\Users\\me\\projects'; ` +
                    `Write-Host ''; ` +
                    `Write-Host 'Press any key to close the terminal and continue ...'; ` +
                    "Read-Host; " +
                    "exit"
            );
        });

        it("builds the command for cmd.exe", () => {
            // cmd.exe gets & separators, cls/pause, and per-line echo with the
            // quotes in the message escaped as ^" rather than wrapped.
            const command = buildBundleInitCommand(
                escapeExecutableForTerminal(
                    "C:\\Program Files\\databricks.exe",
                    "cmd"
                ),
                "C:\\Users\\me\\projects",
                "cmd"
            );
            assert.strictEqual(
                command,
                "cls & " +
                    'echo Executing: databricks bundle init --output-dir ^"C:\\Users\\me\\projects^" & ' +
                    "echo Follow the steps below to create your new Databricks project. & " +
                    "echo. & " +
                    '"C:\\Program Files\\databricks.exe" bundle init --output-dir "C:\\Users\\me\\projects" & ' +
                    "echo. & " +
                    "echo Press any key to close the terminal and continue ... & " +
                    "pause & " +
                    "exit"
            );
        });

        it("does not emit a bare newline that would truncate the command", () => {
            // The message contains real newlines; every shell must fold them
            // into separate print commands rather than embedding them.
            (["cmd", "powershell", "posix"] as const).forEach((kind) => {
                const command = buildBundleInitCommand("db", "/tmp/out", kind);
                assert.ok(
                    !command.includes("\n"),
                    `${kind} embedded a raw newline: ${command}`
                );
            });
        });

        it("quotes an output dir containing spaces", () => {
            const command = buildBundleInitCommand(
                "db",
                "/home/me/My Projects",
                "posix"
            );
            assert.ok(
                command.includes(
                    "db bundle init --output-dir '/home/me/My Projects'"
                ),
                command
            );
        });

        it("refuses a cmd.exe output dir containing % or !", () => {
            // cmd expands %TEMP% (and !TEMP! under delayed expansion) even
            // inside double quotes, so the CLI would scaffold into a directory
            // the user never chose and getSubProjects would then report "we
            // haven't detected any Databricks projects in ...". The reason is
            // surfaced to the user rather than silently sending the command.
            const reason = unsafeOutputDirReason("C:\\p%TEMP%q\\proj", "cmd");
            assert.ok(reason !== undefined);
            assert.ok(
                reason.includes("C:\\p%TEMP%q\\proj"),
                `reason should name the path: ${reason}`
            );
            assert.ok(
                unsafeOutputDirReason("C:\\p!TEMP!q\\proj", "cmd") !== undefined
            );
        });

        it("allows a % or ! output dir in shells that do not expand it", () => {
            // PowerShell and POSIX single quotes are literal, so refusing there
            // would block directories that work fine.
            assert.strictEqual(
                unsafeOutputDirReason("/tmp/p%TEMP%q", "posix"),
                undefined
            );
            assert.strictEqual(
                unsafeOutputDirReason("C:\\p%TEMP%q", "powershell"),
                undefined
            );
            assert.strictEqual(
                unsafeOutputDirReason("C:\\Users\\me\\proj", "cmd"),
                undefined
            );
        });

        it("throws rather than emitting a command cmd.exe would rewrite", () => {
            // The guard is enforced in the builder too, so no caller can send a
            // silently-corrupted path even if it skips the check above.
            assert.throws(
                () => buildBundleInitCommand("db", "C:\\p%TEMP%q", "cmd"),
                /%/
            );
            // The same path is fine for the shells that quote it literally.
            assert.ok(
                buildBundleInitCommand("db", "C:\\p%TEMP%q", "powershell")
            );
        });

        it("keeps % literal in the banner for shells that support it", async function () {
            // The "Executing:" banner must show the path the CLI actually
            // receives; a banner that expands differently would mislead anyone
            // debugging a wrong-directory report.
            if (process.platform === "win32") {
                this.skip();
            }
            const outputDir = "/tmp/p%TEMP%q";
            const command = buildBundleInitCommand("true", outputDir, "posix");
            const {stdout} = await execFileAsync("/bin/sh", [
                "-c",
                `{ ${command} ; } < /dev/null`,
            ]).catch((e: {stdout: string}) => e);
            assert.ok(
                stdout.includes(`--output-dir '${outputDir}'`),
                `banner did not show the literal path:\n${stdout}`
            );
        });

        it("passes an awkward output dir through a real shell intact", async function () {
            // String equality only proves we built what we meant to. Run the
            // command for real and check the CLI receives the directory as one
            // unexpanded argument. /bin/sh is POSIX-only, so skip on Windows.
            if (process.platform === "win32") {
                this.skip();
            }
            const outputDir = `/tmp/My Dir's "odd" $HOME`;
            const command = buildBundleInitCommand(
                // Stand in for the CLI: print the arguments one per line.
                `printf '%s\\n'`,
                outputDir,
                "posix"
            );

            // Run the command exactly as shipped, with stdin closed for the whole
            // shell so the hold-open read returns at once. Rewriting the command
            // to strip that read would silently stop matching whenever the
            // command changes, and the test would hang instead of failing.
            // `read` at EOF exits non-zero, so the exit code is ignored; only the
            // output matters here.
            const {stdout} = await execFileAsync("/bin/sh", [
                "-c",
                `{ ${command} ; } < /dev/null`,
            ]).catch((e: {stdout: string}) => e);
            assert.ok(
                stdout.includes(`\n${outputDir}\n`),
                `output dir did not survive the shell:\n${stdout}`
            );
        });
    });
});
