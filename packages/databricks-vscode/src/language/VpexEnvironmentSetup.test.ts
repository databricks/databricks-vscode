import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {ExtensionContext} from "vscode";
import {instance, mock, when} from "ts-mockito";
import {MsPythonExtensionWrapper} from "./MsPythonExtensionWrapper";
import {VpexEnvironmentSetup} from "./VpexEnvironmentSetup";

// Reach into the private methods we want to unit test without going through
// the full VS Code UI flow.
interface VpexInternals {
    detectTarget(projectDir: string): {
        serverless: boolean;
        authProfile: string;
    };
    friendlyPhase(stepLabel: string, name: string): string;
}

describe(__filename, () => {
    let pythonExtensionMock: MsPythonExtensionWrapper;
    let setup: VpexEnvironmentSetup;
    let internals: VpexInternals;
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vpex-test-"));
        pythonExtensionMock = mock(MsPythonExtensionWrapper);
        when(pythonExtensionMock.projectRoot).thenReturn(tmpDir);
        const context = {
            asAbsolutePath: (rel: string) => path.join(tmpDir, rel),
        } as unknown as ExtensionContext;
        setup = new VpexEnvironmentSetup(
            context,
            instance(pythonExtensionMock)
        );
        internals = setup as unknown as VpexInternals;
    });

    afterEach(() => {
        setup.dispose();
        fs.rmSync(tmpDir, {recursive: true, force: true});
    });

    function writeOverrides(contents: string) {
        const dir = path.join(tmpDir, ".databricks", "bundle", "dev");
        fs.mkdirSync(dir, {recursive: true});
        fs.writeFileSync(path.join(dir, "vscode.overrides.json"), contents);
    }

    describe("detectTarget", () => {
        it("reads serverless and profile from the overrides file", () => {
            writeOverrides(
                JSON.stringify({authProfile: "prod", serverless: true})
            );
            const target = internals.detectTarget(tmpDir);
            assert.strictEqual(target.serverless, true);
            assert.strictEqual(target.authProfile, "prod");
        });

        it("treats a non-serverless override as cluster", () => {
            writeOverrides(
                JSON.stringify({authProfile: "dev", serverless: false})
            );
            const target = internals.detectTarget(tmpDir);
            assert.strictEqual(target.serverless, false);
        });

        it("falls back to serverless/dev when the file is missing", () => {
            const target = internals.detectTarget(tmpDir);
            assert.deepStrictEqual(target, {
                serverless: true,
                authProfile: "dev",
            });
        });

        it("falls back gracefully on malformed JSON", () => {
            writeOverrides("{ not valid json");
            const target = internals.detectTarget(tmpDir);
            assert.deepStrictEqual(target, {
                serverless: true,
                authProfile: "dev",
            });
        });
    });

    describe("friendlyPhase", () => {
        it("maps real CLI phase headers to narrated messages, prefixed with the step", () => {
            assert.strictEqual(
                internals.friendlyPhase("init", "preflight"),
                "dbconnect init: checking prerequisites…"
            );
            assert.strictEqual(
                internals.friendlyPhase("init", "resolve"),
                "dbconnect init: resolving target…"
            );
            assert.strictEqual(
                internals.friendlyPhase("init", "fetch"),
                "dbconnect init: fetching constraints…"
            );
            assert.strictEqual(
                internals.friendlyPhase("init", "parse-python-version"),
                "dbconnect init: reading Python version…"
            );
            assert.strictEqual(
                internals.friendlyPhase("sync", "plan"),
                "dbconnect sync: planning pyproject.toml changes…"
            );
            assert.strictEqual(
                internals.friendlyPhase("sync", "provision"),
                "dbconnect sync: provisioning .venv via uv…"
            );
        });

        it("falls back to a generic label for unknown phases", () => {
            assert.strictEqual(
                internals.friendlyPhase("init", "something-new"),
                "dbconnect init: something-new"
            );
        });
    });
});
