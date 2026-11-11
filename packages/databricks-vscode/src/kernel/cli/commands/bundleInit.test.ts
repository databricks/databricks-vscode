import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { UserFacingError } from "../../../platform/errors";
import { escapePathArgument } from "../../../platform/shell";
import { useTempDirs } from "../../../test-support/tempDir";
import { bundleInitCommandLine, bundleInitEnv, bundleInitShellArgs } from "./bundleInit";

const tempDir = useTempDirs();

// Ported from the old `shellUtils.test.ts` ("the bundle init command line").
describe("the bundle init command line", () => {
    it("is valid cmd (the #1822 case)", () => {
        expect(
            bundleInitCommandLine("C:\\ext\\bin\\databricks.exe", "C:\\Users\\me\\proj", "cmd"),
        ).toBe(
            'echo Executing: databricks bundle init --output-dir "C:\\Users\\me\\proj"& ' +
                "echo Follow the steps below to create your new Databricks project.& echo.& " +
                '"C:\\ext\\bin\\databricks.exe" bundle init --output-dir "C:\\Users\\me\\proj"& ' +
                "echo.& echo Press any key to close the terminal and continue ...& pause",
        );
    });

    it("is valid powershell", () => {
        expect(
            bundleInitCommandLine(
                "C:\\ext\\bin\\databricks.exe",
                "C:\\Users\\me\\proj",
                "powershell",
            ),
        ).toBe(
            "Write-Host 'Executing: databricks bundle init --output-dir ''C:\\Users\\me\\proj'''; " +
                "Write-Host 'Follow the steps below to create your new Databricks project.'; Write-Host ''; " +
                "& 'C:\\ext\\bin\\databricks.exe' bundle init --output-dir 'C:\\Users\\me\\proj'; " +
                "Write-Host ''; Write-Host 'Press any key to close the terminal and continue ...'; Read-Host",
        );
    });

    it("is valid posix", () => {
        expect(bundleInitCommandLine("/opt/databricks", "/home/me/proj", "posix")).toBe(
            "printf '%s\\n' 'Executing: databricks bundle init --output-dir '\\''/home/me/proj'\\'''; " +
                "printf '%s\\n' 'Follow the steps below to create your new Databricks project.'; printf '%s\\n' ''; " +
                "'/opt/databricks' bundle init --output-dir '/home/me/proj'; " +
                "printf '%s\\n' ''; printf '%s\\n' 'Press any key to close the terminal and continue ...'; read discard",
        );
    });

    it.each(["C:\\Users\\100%\\proj", "C:\\Users\\wow!\\proj"])(
        "refuses %s in cmd, which would expand it",
        (dir) => {
            expect(() => bundleInitCommandLine("C:\\databricks.exe", dir, "cmd")).toThrow(
                UserFacingError,
            );
            expect(() => bundleInitCommandLine("C:\\databricks.exe", dir, "cmd")).toThrow(
                `Can't create a project in "${dir}": the Command Prompt shell expands "%" and "!" in paths.`,
            );
        },
    );

    it("accepts % and ! in PowerShell and POSIX shells, quoted", () => {
        expect(bundleInitCommandLine("C:\\databricks.exe", "C:\\100%!", "powershell")).toContain(
            "--output-dir 'C:\\100%!'",
        );
        expect(bundleInitCommandLine("/databricks", "/tmp/100%!", "posix")).toContain(
            "--output-dir '/tmp/100%!'",
        );
    });

    it("is the shell's argument, not typed at its prompt", () => {
        expect(bundleInitShellArgs("/opt/databricks", "/home/me/proj", "posix")).toEqual([
            "-c",
            bundleInitCommandLine("/opt/databricks", "/home/me/proj", "posix"),
        ]);
    });

    it("asks the CLI for text output", () => {
        expect(
            bundleInitEnv({
                DATABRICKS_OUTPUT_FORMAT: "json",
                DATABRICKS_CONFIG_PROFILE: "DEFAULT",
            }),
        ).toEqual({
            DATABRICKS_OUTPUT_FORMAT: "text",
            DATABRICKS_CONFIG_PROFILE: "DEFAULT",
        });
    });
});

/** The shells on this host that `detectShellKind` calls "posix", fish included when it is on `PATH`. */
function posixShells(): string[] {
    const fish = spawnSync("which", ["fish"], { encoding: "utf8" }).stdout?.split("\n")[0]?.trim();
    return ["/bin/sh", "/bin/bash", "/bin/zsh", "/bin/dash", ...(fish ? [fish] : [])].filter((s) =>
        fs.existsSync(s),
    );
}

// None on Windows; a suite without tests is an error.
const SHELLS = posixShells();

describe.skipIf(SHELLS.length === 0)(
    "the bundle init command line, typed into a real shell",
    () => {
        SHELLS.forEach((shell) => {
            it(`runs only the CLI, with the parent folder as chosen, in ${shell}`, () => {
                const t = tempDir();
                const argvFile = t.path("argv");
                const cli = t.write(
                    "bin/databricks",
                    `#!/bin/sh\nprintf '%s\\n' "$@" > '${argvFile}'\n`,
                );
                fs.chmodSync(cli, 0o755);
                const injected = t.path("injected");
                const folders = [
                    `/tmp/it's a "quoted" folder`,
                    `/tmp/$(touch ${injected}) and \`touch ${injected}\``,
                    `/tmp/a; touch ${injected}`,
                    // fish reads \' and \\ as escapes inside single quotes, where POSIX shells don't.
                    `/tmp/x\\'; touch ${injected} #`,
                    "/tmp/two\\\\slashes",
                    "/tmp/trailing\\",
                ];
                for (const folder of folders) {
                    fs.rmSync(argvFile, { force: true });
                    // As the terminal runs it; the newline answers "Press any key".
                    const result = spawnSync(
                        shell,
                        bundleInitShellArgs(cli, folder, "posix") as string[],
                        {
                            encoding: "utf8",
                            input: "\n",
                            env: { ...process.env, TERM: "dumb" },
                        },
                    );
                    expect({
                        folder,
                        status: result.status,
                        injected: fs.existsSync(injected),
                        argv: fs.existsSync(argvFile)
                            ? fs.readFileSync(argvFile, "utf8").split("\n").slice(0, -1)
                            : [],
                        banner: result.stdout
                            .split("\n")
                            .includes(
                                `Executing: databricks bundle init --output-dir ${escapePathArgument(folder, "posix")}`,
                            ),
                    }).toEqual({
                        folder,
                        status: 0,
                        injected: false,
                        argv: ["bundle", "init", "--output-dir", folder],
                        banner: true,
                    });
                }
            });
        });
    },
);
