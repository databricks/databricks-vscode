import * as assert from "assert";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import {Uri} from "vscode";
import {anything, instance, mock, when} from "ts-mockito";
import {
    EnvironmentProvisioner,
    ProvisionError,
    buildProvisionEnv,
    classifyProvisionFailure,
    readPipIndexUrl,
    venvPythonExecutable,
} from "./EnvironmentProvisioner";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {UvBinaryProvider} from "./UvBinaryProvider";
import {Telemetry} from "../telemetry";
import {cancellableExecFile} from "../cli/CliWrapper";

describe(__filename, () => {
    describe("venvPythonExecutable", () => {
        it("should use bin/python on posix", () => {
            assert.strictEqual(
                venvPythonExecutable("/p/.venv", "darwin"),
                path.join("/p/.venv", "bin", "python")
            );
        });
        it("should use Scripts/python.exe on windows", () => {
            assert.strictEqual(
                venvPythonExecutable("C:\\p\\.venv", "win32"),
                path.join("C:\\p\\.venv", "Scripts", "python.exe")
            );
        });
    });

    /* eslint-disable @typescript-eslint/naming-convention */
    describe("buildProvisionEnv", () => {
        it("should map PIP_INDEX_URL to UV_INDEX_URL", () => {
            const env = buildProvisionEnv({
                PIP_INDEX_URL: "https://mirror.corp/simple",
            });
            assert.strictEqual(env.UV_INDEX_URL, "https://mirror.corp/simple");
        });
        it("should not override an explicit UV_INDEX_URL", () => {
            const env = buildProvisionEnv({
                PIP_INDEX_URL: "https://pip.corp/simple",
                UV_INDEX_URL: "https://uv.corp/simple",
            });
            assert.strictEqual(env.UV_INDEX_URL, "https://uv.corp/simple");
        });
        it("should fall back to the pip.conf index url", () => {
            const env = buildProvisionEnv({}, "https://conf.corp/simple");
            assert.strictEqual(env.UV_INDEX_URL, "https://conf.corp/simple");
        });
        it("should leave UV_INDEX_URL unset without custom indexes", () => {
            const env = buildProvisionEnv({});
            assert.strictEqual(env.UV_INDEX_URL, undefined);
        });
    });

    describe("readPipIndexUrl", () => {
        it("should read index-url from PIP_CONFIG_FILE", () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pipconf-"));
            const confPath = path.join(dir, "pip.conf");
            fs.writeFileSync(
                confPath,
                "[global]\ntimeout = 60\nindex-url = https://mirror.corp/simple\n"
            );
            try {
                assert.strictEqual(
                    readPipIndexUrl("darwin", {PIP_CONFIG_FILE: confPath}, dir),
                    "https://mirror.corp/simple"
                );
            } finally {
                fs.rmSync(dir, {recursive: true, force: true});
            }
        });
        it("should return undefined when no pip.conf exists", () => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pipconf-"));
            try {
                assert.strictEqual(
                    readPipIndexUrl("darwin", {}, dir),
                    undefined
                );
            } finally {
                fs.rmSync(dir, {recursive: true, force: true});
            }
        });
    });
    /* eslint-enable @typescript-eslint/naming-convention */

    describe("classifyProvisionFailure", () => {
        const cases: Array<{message: string; expected: string}> = [
            {
                message:
                    "error sending request for url (https://pypi.org/simple/databricks-connect/)",
                expected: "networkBlocked",
            },
            {
                message: "connect ECONNREFUSED 104.16.0.1:443",
                expected: "networkBlocked",
            },
            {
                message: "No download found for request: cpython-3.12",
                expected: "pythonUnavailable",
            },
            {message: "ENOSPC: no space left on device", expected: "disk"},
            {message: "something exploded", expected: "unknown"},
        ];
        for (const {message, expected} of cases) {
            it(`should classify "${message.slice(
                0,
                40
            )}..." as ${expected}`, () => {
                assert.strictEqual(
                    classifyProvisionFailure(new Error(message)),
                    expected
                );
            });
        }
        it("should keep the class of ProvisionError", () => {
            assert.strictEqual(
                classifyProvisionFailure(
                    new ProvisionError("uv missing", "uvUnavailable")
                ),
                "uvUnavailable"
            );
        });
    });

    describe("ensureEnvironment", () => {
        let projectDir: string;
        let venvDir: string;
        let execCalls: string[][] = [];
        let selectedInterpreter: string | undefined;
        let foreignVenvChoice: "repair" | "recreate" | "manual" = "manual";
        /** keyed responses for the python version/dbconnect probes */
        let venvPythonVersion: string | undefined;
        let installedDbconnect: string | undefined;

        class TestProvisioner extends EnvironmentProvisioner {
            protected override async promptForeignVenv(): Promise<
                "repair" | "recreate" | "manual"
            > {
                return foreignVenvChoice;
            }
        }

        const fakeExec: typeof cancellableExecFile = async (file, args) => {
            execCalls.push([file, ...args]);
            const code = args.includes("-c") ? args[args.length - 1] : "";
            if (code.includes("sys.version_info")) {
                if (!venvPythonVersion) {
                    throw new Error("broken interpreter");
                }
                return {stdout: `${venvPythonVersion}\n`, stderr: ""};
            }
            if (code.includes("databricks-connect")) {
                if (!installedDbconnect) {
                    throw new Error(
                        "importlib.metadata.PackageNotFoundError: databricks-connect"
                    );
                }
                return {stdout: `${installedDbconnect}\n`, stderr: ""};
            }
            if (args[0] === "venv") {
                fs.mkdirSync(path.join(venvDir, "bin"), {recursive: true});
                fs.writeFileSync(path.join(venvDir, "bin", "python"), "");
            }
            return {stdout: "", stderr: ""};
        };

        function createProvisioner(
            execFn: typeof cancellableExecFile = fakeExec
        ) {
            const connectionManagerMock = mock(ConnectionManager);
            when(connectionManagerMock.serverless).thenReturn(true);
            when(connectionManagerMock.cluster).thenReturn(undefined);

            const uvProviderMock = mock(UvBinaryProvider);
            when(uvProviderMock.getUvPath(anything())).thenResolve("uv");

            const pythonExtensionFake = {
                api: {
                    environments: {
                        refreshEnvironments: async () => {},
                        updateActiveEnvironmentPath: async (p: string) => {
                            selectedInterpreter = p;
                        },
                    },
                },
            } as unknown as MsPythonExtensionWrapper;

            return new TestProvisioner(
                instance(connectionManagerMock),
                pythonExtensionFake,
                {
                    activeProjectUri: Uri.file(projectDir),
                } as unknown as WorkspaceFolderManager,
                instance(uvProviderMock),
                instance(mock(Telemetry)),
                execFn
            );
        }

        function uvCommands() {
            return execCalls
                .filter(([file]) => file === "uv")
                .map((call) => call.slice(1, 3).join(" "));
        }

        beforeEach(() => {
            projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "dbx-proj-"));
            venvDir = path.join(projectDir, ".venv");
            execCalls = [];
            selectedInterpreter = undefined;
            venvPythonVersion = undefined;
            installedDbconnect = undefined;
            foreignVenvChoice = "manual";
        });

        afterEach(() => {
            fs.rmSync(projectDir, {recursive: true, force: true});
        });

        it("should create the venv and install dependencies in a fresh project", async () => {
            fs.writeFileSync(
                path.join(projectDir, "requirements.txt"),
                "pandas\n"
            );
            const provisioner = createProvisioner();

            const result = await provisioner.ensureEnvironment();

            assert.strictEqual(result.success, true);
            assert.deepStrictEqual(uvCommands(), [
                "python find",
                "venv " + venvDir,
                "pip install",
                "pip install",
            ]);
            const dbconnectInstall = execCalls.find((c) =>
                c.some((a) => a.startsWith("databricks-connect=="))
            );
            assert.ok(dbconnectInstall);
            assert.ok(dbconnectInstall.includes("databricks-connect==17.3.*"));
            assert.ok(dbconnectInstall.includes("nbformat"));
            const requirementsInstall = execCalls.find((c) => c.includes("-r"));
            assert.ok(requirementsInstall);
            assert.ok(
                requirementsInstall.includes(
                    path.join(projectDir, "requirements.txt")
                )
            );
            assert.strictEqual(
                selectedInterpreter,
                venvPythonExecutable(venvDir)
            );
            const marker = JSON.parse(
                fs.readFileSync(path.join(venvDir, "databricks.json"), "utf-8")
            );
            assert.strictEqual(marker.createdBy, "databricks-vscode");
            assert.strictEqual(marker.pythonVersion, "3.12");
        });

        it("should recreate a managed venv with the wrong python version", async () => {
            fs.mkdirSync(path.join(venvDir, "bin"), {recursive: true});
            fs.writeFileSync(path.join(venvDir, "bin", "python"), "");
            fs.writeFileSync(
                path.join(venvDir, "databricks.json"),
                JSON.stringify({createdBy: "databricks-vscode"})
            );
            venvPythonVersion = "3.10";
            const provisioner = createProvisioner();

            const result = await provisioner.ensureEnvironment();

            assert.strictEqual(result.success, true);
            assert.ok(uvCommands().includes("venv " + venvDir));
        });

        it("should only install dependencies into a managed venv with a matching python", async () => {
            fs.mkdirSync(path.join(venvDir, "bin"), {recursive: true});
            fs.writeFileSync(path.join(venvDir, "bin", "python"), "");
            fs.writeFileSync(
                path.join(venvDir, "databricks.json"),
                JSON.stringify({createdBy: "databricks-vscode"})
            );
            venvPythonVersion = "3.12";
            const provisioner = createProvisioner();

            const result = await provisioner.ensureEnvironment();

            assert.strictEqual(result.success, true);
            assert.ok(!uvCommands().includes("venv " + venvDir));
            assert.ok(uvCommands().includes("pip install"));
        });

        it("should not touch a foreign venv when the user chooses manual setup", async () => {
            fs.mkdirSync(path.join(venvDir, "bin"), {recursive: true});
            fs.writeFileSync(path.join(venvDir, "bin", "python"), "");
            venvPythonVersion = "3.10";
            foreignVenvChoice = "manual";
            const provisioner = createProvisioner();

            const result = await provisioner.ensureEnvironment();

            assert.strictEqual(result.success, false);
            assert.strictEqual(result.noOp, true);
            assert.deepStrictEqual(uvCommands(), []);
            assert.ok(!fs.existsSync(path.join(venvDir, "databricks.json")));
        });

        it("should select a satisfied foreign venv without modifying it", async () => {
            fs.mkdirSync(path.join(venvDir, "bin"), {recursive: true});
            fs.writeFileSync(path.join(venvDir, "bin", "python"), "");
            venvPythonVersion = "3.12";
            installedDbconnect = "17.3.2";
            const provisioner = createProvisioner();

            const result = await provisioner.ensureEnvironment();

            assert.strictEqual(result.success, true);
            assert.deepStrictEqual(uvCommands(), []);
            assert.strictEqual(
                selectedInterpreter,
                venvPythonExecutable(venvDir)
            );
            assert.ok(!fs.existsSync(path.join(venvDir, "databricks.json")));
        });

        it("should clean up a venv it created when installation fails", async () => {
            const failingExec: typeof cancellableExecFile = async (
                file,
                args,
                options,
                token
            ) => {
                if (args[0] === "pip") {
                    throw new Error(
                        "error sending request for url (https://pypi.org/simple/)"
                    );
                }
                return fakeExec(file, args, options, token);
            };
            const provisioner = createProvisioner(failingExec);

            const result = await provisioner.ensureEnvironment();

            assert.strictEqual(result.success, false);
            assert.strictEqual(result.failureClass, "networkBlocked");
            assert.strictEqual(result.failedStep, "depsInstall");
            assert.ok(!fs.existsSync(venvDir));
        });
    });
});
