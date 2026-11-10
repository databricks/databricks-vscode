import { describe, expect, it } from "vitest";
import { Telemetry } from "../../../../kernel/telemetry/Telemetry";
import type { UserFacingError } from "../../../../platform/errors";
import { FakeProcessRunner } from "../../../../test-support/fakeCli";
import { fakeReporter } from "../../../../test-support/fakes";
import { useTempDirs } from "../../../../test-support/tempDir";
import { PYTHON_ENV_DBCONNECT_INSTALL } from "../../telemetry";
import type { ChecklistCompute } from "./checks";
import { DbConnectInstaller } from "./DbConnectInstaller";
import { Packages } from "./Packages";

const tempDir = useTempDirs();
const PYTHON = "/project/.venv/bin/python";

function installer(
    options: {
        installed?: { name: string; version: string }[];
        failInstall?: boolean;
        executable?: string;
        compute?: ChecklistCompute;
        choice?: string;
        input?: string;
    } = {},
) {
    const t = tempDir();
    t.write("project/.keep", "");
    const runner = new FakeProcessRunner();
    runner.on(["-m", "pip", "list"], { stdout: JSON.stringify(options.installed ?? []) });
    runner.on(["-m", "pip", "install"], { exitCode: options.failInstall ? 1 : 0 });
    const log: string[] = [];
    const channel = { text: "", shown: 0, cleared: 0 };
    const reporter = fakeReporter();
    let now = 0;
    const telemetry = new Telemetry(reporter, () => (now += 5));
    const ui = {
        infos: [] as { message: string; choices: string[] }[],
        errors: [] as string[],
        inputs: [] as { prompt: string; value: string }[],
        showInformationMessage: async (message: string, ...choices: string[]) => {
            ui.infos.push({ message, choices });
            return options.choice;
        },
        showError: async (error: UserFacingError) => void ui.errors.push(error.userMessage),
        showInputBox: async (o: { prompt: string; value: string }) => {
            ui.inputs.push(o);
            return options.input;
        },
    };
    const i = new DbConnectInstaller({
        packages: new Packages({ processes: runner, root: t.path("project"), env: () => ({}) }),
        executable: async () => ("executable" in options ? options.executable : PYTHON),
        environmentName: async () => ".venv",
        compute: () => options.compute ?? { kind: "serverless", dbConnectVersion: "17.3" },
        channel: () => ({
            clear: () => void (channel.cleared++, (channel.text = "")),
            show: () => void channel.shown++,
            append: (s) => void (channel.text += s),
            appendLine: (s) => void (channel.text += `${s}\n`),
        }),
        ui,
        selectInterpreter: async () => void log.push("selectInterpreter"),
        startInstall: () => telemetry.start(PYTHON_ENV_DBCONNECT_INSTALL),
        onInstalled: async () => {
            // Readiness is re-evaluated after the pip work, before the install resolves.
            log.push(`refresh after ${runner.calls.length} calls`);
        },
    });
    return { i, runner, log, channel, reporter, ui };
}

describe("DbConnectInstaller (PYENV-08)", () => {
    it("removes pyspark and databricks-connect, installs the version and nbformat, then refreshes", async () => {
        const { i, runner, log, channel } = installer({
            installed: [
                { name: "pyspark", version: "3.5.0" },
                { name: "databricks-connect", version: "13.3.0" },
            ],
        });
        expect(await i.install("17.3.*")).toBe("ok");
        expect(runner.argv.filter((a) => a[2] !== "list")).toEqual([
            ["-m", "pip", "uninstall", "pyspark", "-y", "--disable-pip-version-check"],
            ["-m", "pip", "uninstall", "databricks-connect", "-y", "--disable-pip-version-check"],
            ["-m", "pip", "install", "databricks-connect==17.3.*", "--disable-pip-version-check"],
            ["-m", "pip", "install", "nbformat", "--disable-pip-version-check"],
        ]);
        expect(log).toEqual([`refresh after ${runner.calls.length} calls`]);
        expect(channel).toMatchObject({ cleared: 1, shown: 1 });
        expect(channel.text).toContain(
            "Running: /project/.venv/bin/python -m pip install databricks-connect==17.3.*",
        );
    });

    it("installs the suggested version when none is given", async () => {
        const { i, runner } = installer({
            compute: { kind: "cluster", dbrVersion: [15, 4, "x"], accessMode: "SINGLE_USER" },
        });
        await i.install();
        expect(runner.argv.find((a) => a[2] === "install")?.[3]).toBe("databricks-connect==15.4.*");
    });

    it("records a successful install as outcome ok, with the pip work's duration", async () => {
        const { i, reporter } = installer();
        await i.install("1.2.3");
        const event = reporter.events.at(-1);
        expect(event?.name).toBe("python_env.dbconnect_install");
        expect(event?.properties?.["event.outcome"]).toBe("ok");
        expect(event?.measurements?.["event.duration"]).toBeGreaterThanOrEqual(0);
    });

    it("records a failed install as outcome failed, shows the error and the channel, and still refreshes", async () => {
        const { i, reporter, ui, channel, log } = installer({ failInstall: true });
        expect(await i.install("1.2.3")).toBe("failed");
        expect(reporter.events.at(-1)?.properties?.["event.outcome"]).toBe("failed");
        expect(ui.errors).toEqual(["Command exited with code 1"]);
        expect(channel.shown).toBe(2);
        expect(log).toHaveLength(1);
    });

    it("fails without an interpreter", async () => {
        const { i, ui } = installer({ executable: undefined });
        expect(await i.install("1.2.3")).toBe("failed");
        expect(ui.errors).toEqual(["No python executable found"]);
    });

    describe("the prompt", () => {
        it("advertises the install after an interpreter change, and installs the suggested version", async () => {
            const { i, ui, runner } = installer({ choice: "Install" });
            await i.show(true);
            expect(ui.infos).toEqual([
                {
                    message:
                        "Interactive debugging in PySpark is now available. Start using it by installing Databricks Connect in the environment .venv. ",
                    choices: ["Install", "Change environment", "Change version"],
                },
            ]);
            expect(runner.argv.find((a) => a[2] === "install")?.[3]).toBe(
                "databricks-connect==17.3.*",
            );
        });

        it("says what changes: pyspark goes, or the installed version is replaced", async () => {
            const withPyspark = installer({ installed: [{ name: "pyspark", version: "3.5.0" }] });
            await withPyspark.i.show();
            expect(withPyspark.ui.infos[0]?.message).toBe(
                "For interactive debugging and autocompletion you need Databricks Connect. Would you like to install it in the environment .venv. (pyspark will be uninstalled)",
            );
            const withOld = installer({
                installed: [{ name: "databricks-connect", version: "15.1.0" }],
            });
            await withOld.i.show();
            expect(withOld.ui.infos[0]?.message).toContain(
                "(databricks-connect will be changed from 15.1.0 to 17.3.*)",
            );
        });

        it("changes the environment, or asks for the version", async () => {
            const change = installer({ choice: "Change environment" });
            await change.i.show();
            expect(change.log).toEqual(["selectInterpreter"]);

            const version = installer({ choice: "Change version", input: "16.4.*" });
            await version.i.show();
            expect(version.ui.inputs).toEqual([
                { prompt: "Enter a version of the Databricks Connect", value: "17.3.*" },
            ]);
            expect(version.runner.argv.find((a) => a[2] === "install")?.[3]).toBe(
                "databricks-connect==16.4.*",
            );
        });

        it("does nothing when dismissed", async () => {
            const { i, runner, log } = installer({ choice: undefined });
            await i.show();
            expect(runner.argv.some((a) => a[2] === "install")).toBe(false);
            expect(log).toEqual([]);
        });

        it("installs nothing when the version prompt is dismissed", async () => {
            const { i, runner } = installer({ input: undefined });
            await i.installWithVersionPrompt("14.3.*");
            expect(runner.argv.some((a) => a[2] === "install")).toBe(false);
        });
    });
});
