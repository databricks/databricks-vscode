import * as assert from "assert";
import {Disposable, Extension, OutputChannel, Uri} from "vscode";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {IExtensionApi as MsPythonExtensionApi} from "./MsPythonExtensionApi";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {StateStorage} from "../vscode-objs/StateStorage";

const PIP_MISSING_ERROR = new Error(
    "Command failed: python -m pip list --format json\n" +
        "/project/.venv/bin/python: No module named pip"
);

const PIP_LIST_OUTPUT = JSON.stringify([
    {name: "databricks-connect", version: "17.3.1"},
]);

class TestableWrapper extends MsPythonExtensionWrapper {
    execCalls: Array<{command: string; args: string[]}> = [];
    runCalls: Array<{command: string; args: string[]}> = [];
    /** Simulates an environment without pip until ensurepip is executed */
    pipIsMissing = false;
    execError?: Error;
    usesUv = false;

    protected override async execCommand(command: string, args: string[]) {
        this.execCalls.push({command, args});
        if (this.execError) {
            throw this.execError;
        }
        if (this.pipIsMissing && args.includes("pip")) {
            throw PIP_MISSING_ERROR;
        }
        return {stdout: PIP_LIST_OUTPUT};
    }

    override async runWithOutput(
        command: string,
        args: string[],
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        outputChannel?: OutputChannel
    ) {
        this.runCalls.push({command, args});
        if (args.includes("ensurepip")) {
            this.pipIsMissing = false;
            return;
        }
        if (this.pipIsMissing && args.includes("pip")) {
            throw PIP_MISSING_ERROR;
        }
    }

    override async isUsingUv() {
        return this.usesUv;
    }

    get ensurepipCalls() {
        return this.runCalls.filter((c) => c.args.includes("ensurepip"));
    }
}

describe(__filename, () => {
    let wrapper: TestableWrapper;
    // Use the node executable as a stand-in for python: pythonEnvironment
    // requires the interpreter path to exist on disk.
    const executablePath = process.execPath;

    beforeEach(() => {
        const api = {
            settings: {
                onDidChangeExecutionDetails: () => new Disposable(() => {}),
            },
            environments: {
                getActiveEnvironmentPath: () => ({
                    id: executablePath,
                    path: executablePath,
                }),
                resolveEnvironment: async () => ({
                    id: executablePath,
                    path: executablePath,
                    executable: {uri: Uri.file(executablePath)},
                    environment: {name: ".venv"},
                    version: {major: 3, minor: 12, micro: 0},
                }),
            },
        } as unknown as MsPythonExtensionApi;
        const extension = {
            exports: api,
        } as unknown as Extension<MsPythonExtensionApi>;
        const workspaceFolderManager = {
            activeProjectUri: Uri.file("/project"),
        } as unknown as WorkspaceFolderManager;
        wrapper = new TestableWrapper(
            extension,
            workspaceFolderManager,
            {} as unknown as StateStorage
        );
    });

    describe("getPackageDetailsFromEnvironment", () => {
        it("should seed pip with ensurepip when pip is missing", async () => {
            wrapper.pipIsMissing = true;
            const details =
                await wrapper.getPackageDetailsFromEnvironment(
                    "databricks-connect"
                );
            assert.deepStrictEqual(details, {
                name: "databricks-connect",
                version: "17.3.1",
            });
            assert.strictEqual(wrapper.ensurepipCalls.length, 1);
            assert.deepStrictEqual(wrapper.ensurepipCalls[0], {
                command: executablePath,
                args: ["-m", "ensurepip", "--upgrade"],
            });
            assert.strictEqual(wrapper.execCalls.length, 2);
        });

        it("should not seed pip when pip works", async () => {
            const details =
                await wrapper.getPackageDetailsFromEnvironment(
                    "databricks-connect"
                );
            assert.ok(details);
            assert.strictEqual(wrapper.ensurepipCalls.length, 0);
            assert.strictEqual(wrapper.execCalls.length, 1);
        });

        it("should rethrow errors not caused by a missing pip", async () => {
            wrapper.execError = new Error("Command failed: disk full");
            await assert.rejects(
                wrapper.getPackageDetailsFromEnvironment("databricks-connect"),
                /disk full/
            );
            assert.strictEqual(wrapper.ensurepipCalls.length, 0);
        });

        it("should not attempt ensurepip for uv environments", async () => {
            wrapper.usesUv = true;
            wrapper.execError = PIP_MISSING_ERROR;
            await assert.rejects(
                wrapper.getPackageDetailsFromEnvironment("databricks-connect")
            );
            assert.strictEqual(wrapper.ensurepipCalls.length, 0);
        });
    });

    describe("installPackageInEnvironment", () => {
        it("should seed pip with ensurepip when pip is missing", async () => {
            wrapper.pipIsMissing = true;
            await wrapper.installPackageInEnvironment(
                "databricks-connect",
                "17.3.*"
            );
            const installCalls = wrapper.runCalls.filter((c) =>
                c.args.includes("install")
            );
            assert.strictEqual(wrapper.ensurepipCalls.length, 1);
            assert.strictEqual(installCalls.length, 2);
        });

        it("should install without seeding when pip works", async () => {
            await wrapper.installPackageInEnvironment(
                "databricks-connect",
                "17.3.*"
            );
            assert.strictEqual(wrapper.ensurepipCalls.length, 0);
            assert.strictEqual(wrapper.runCalls.length, 1);
        });
    });
});
