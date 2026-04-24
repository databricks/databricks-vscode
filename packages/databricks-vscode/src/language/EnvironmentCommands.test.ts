import assert from "assert";
import {Uri} from "vscode";
import {Environment} from "./MsPythonExtensionApi";
import {environmentName} from "../utils/environmentUtils";

function makeEnvironment(overrides: Partial<Environment> = {}): Environment {
    return {
        id: "env-1",
        path: "/usr/bin/python3",
        executable: {
            uri: Uri.file("/usr/bin/python3"),
            bitness: "64-bit",
            sysPrefix: "/usr",
        },
        environment: {
            type: "VirtualEnvironment",
            name: "test-venv",
            folderUri: Uri.file("/home/user/test-venv"),
            workspaceFolder: undefined,
        },
        version: {
            major: 3,
            minor: 10,
            micro: 0,
            release: {level: "final", serial: 0},
            sysVersion: "3.10.0",
        },
        tools: [],
        ...overrides,
    };
}

function makeGlobalEnvironment(): Environment {
    return makeEnvironment({
        id: "global-python",
        path: "/usr/bin/python3",
        environment: undefined,
    });
}

describe(__filename, () => {
    it("should use path as name for global environments", () => {
        const env = makeGlobalEnvironment();
        const name = environmentName(env);
        assert.strictEqual(name, "3.10.0 /usr/bin/python3");
    });

    it("should use environment name for virtual environments", () => {
        const env = makeEnvironment();
        const name = environmentName(env);
        assert.strictEqual(name, "3.10.0 test-venv");
    });

    it("should handle environments without version", () => {
        const env = makeGlobalEnvironment();
        (env as any).version = undefined;
        const name = environmentName(env);
        assert.strictEqual(name, "/usr/bin/python3");
    });

    it("should identify global environment as having no environment property", () => {
        const globalEnv = makeGlobalEnvironment();
        assert.strictEqual(globalEnv.environment, undefined);
        assert.ok(globalEnv.version);
        assert.ok(globalEnv.executable.uri);
    });

    it("should identify virtual environment as having an environment property", () => {
        const venvEnv = makeEnvironment();
        assert.ok(venvEnv.environment);
        assert.strictEqual(venvEnv.environment!.type, "VirtualEnvironment");
        assert.strictEqual(venvEnv.environment!.name, "test-venv");
    });

    it("should distinguish global from non-global by environment field", () => {
        const globalEnv = makeGlobalEnvironment();
        const venvEnv = makeEnvironment();
        assert.strictEqual(!globalEnv.environment, true);
        assert.strictEqual(!venvEnv.environment, false);
    });

    it("should create pick item with 'Global' description for global environments", () => {
        const env = makeGlobalEnvironment();
        const isGlobal = !env.environment;
        const item = {
            label: environmentName(env),
            description: isGlobal ? "Global" : env.environment?.type,
            detail: env.path,
            path: env.path,
            isGlobal,
        };
        assert.strictEqual(item.description, "Global");
        assert.strictEqual(item.isGlobal, true);
        assert.strictEqual(item.path, "/usr/bin/python3");
    });

    it("should create pick item with env type for virtual environments", () => {
        const env = makeEnvironment();
        const isGlobal = !env.environment;
        const item = {
            label: environmentName(env),
            description: isGlobal ? "Global" : env.environment?.type,
            detail: env.path,
            path: env.path,
            isGlobal,
        };
        assert.strictEqual(item.description, "VirtualEnvironment");
        assert.strictEqual(item.isGlobal, false);
    });
});
