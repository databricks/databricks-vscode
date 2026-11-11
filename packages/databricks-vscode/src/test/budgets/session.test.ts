/**
 * The session budgets, through every feature on the real kernel: a
 * burst of saves starts at most two CLI processes, and the listener count
 * stays flat over target switches, deploys and sign-outs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURES } from "../../features";
import { registerFeatures, startFeatures } from "../../kernel/feature";
import { liveListenerCount } from "../../platform/event";
import { MutableState, when } from "../../platform/reactive";
import { FakeFileEvents } from "../../test-support/fakeFiles";
import { fakeFeatureHost, fakeKernel } from "../../test-support/fakes";
import { installExtensionPack } from "../../test-support/extensionPack";
import { FakeHttpClient, SCIM_ME } from "../../test-support/fakeHttp";
import { useTempDirs } from "../../test-support/tempDir";
import { host as vscode, Uri } from "../../test-support/vscode";

// It loads `vscode` itself, which exists only in the host.
vi.mock("@vscode/extension-telemetry", () => ({
    TelemetryReporter: class {
        sendTelemetryEvent() {}
        sendTelemetryErrorEvent() {}
        dispose() {
            return Promise.resolve();
        }
    },
}));

const HOST = "https://a.cloud.databricks.com";
const tempDir = useTempDirs();

async function setup() {
    const t = tempDir();
    const config = t.write(".databrickscfg", `[DEFAULT]\nhost = ${HOST}\ntoken = dapi-default\n`);
    t.write(
        "project/databricks.yml",
        `bundle: {name: demo}\ntargets:\n  dev: {default: true, mode: development, workspace: {host: ${HOST}}}\n  prod: {mode: production, workspace: {host: ${HOST}}}\n`,
    );
    t.write("project/src/main.py", "print('hi')\n");
    const root = t.path("project");
    vscode.folders = [root];
    const files = new FakeFileEvents();
    const http = new FakeHttpClient().on("GET", SCIM_ME, () => ({ body: { userName: "me" } }));
    const kernel = fakeKernel({
        env: { DATABRICKS_CONFIG_FILE: config },
        httpClient: http,
        folders: new MutableState<readonly string[]>([root]),
        files,
    });
    const mode = (target: string) => (target === "dev" ? "development" : "production");
    kernel.runner.on(["bundle", "validate"], (args) => ({
        stdout: JSON.stringify({ bundle: { name: "demo", target: args[3], mode: mode(args[3]!) } }),
    }));
    kernel.runner.on(["bundle", "summary"], (args) => ({
        stdout: JSON.stringify({ bundle: { name: "demo", target: args[3] } }),
    }));
    const fake = fakeFeatureHost(kernel);
    const registered = registerFeatures(FEATURES, fake.host);
    kernel.start();
    startFeatures(registered);
    const processes = () => kernel.runner.calls.length + kernel.runner.started.length;
    /** Waits until the bundle has nothing scheduled or in flight. */
    const settle = async () => {
        await new Promise((r) => setTimeout(r, 400));
        await kernel.bundle.validated.settled();
        await kernel.bundle.deployed.settled();
        await new Promise((r) => setTimeout(r, 50));
    };
    const ready = async (target: string) => {
        await when(kernel.connection.state, (s) => s.status === "connected");
        await when(
            kernel.bundle.validated,
            (v) => v.status === "ready" && v.value.target === target,
        );
        await settle();
    };
    const dispose = () => {
        for (const { ctx } of registered.toReversed()) {
            ctx.subscriptions.toReversed().forEach((s) => s.dispose());
        }
        kernel.dispose();
    };
    return { t, root, kernel, files, processes, settle, ready, dispose };
}

describe("session budgets", () => {
    beforeEach(() => vscode.reset());

    it("starts at most two CLI processes for a burst of saves", async () => {
        const s = await setup();
        await s.ready("dev");
        const before = s.processes();
        const yml = `${s.root}/databricks.yml`;
        for (let i = 0; i < 10; i++) {
            s.files.touch(yml);
            s.files.touch(`${s.root}/src/main.py`);
            vscode.documentSaved.fire({ uri: Uri.file(yml) });
            vscode.documentSaved.fire({ uri: Uri.file(`${s.root}/src/main.py`) });
        }
        await s.settle();
        const started = s.kernel.runner.argv.slice(before).map((a) => a.slice(0, 2).join(" "));
        expect(s.processes() - before, started.join(", ")).toBeLessThanOrEqual(2);
        s.dispose();
    });

    it("starts only ms-python of the extension pack, for the Python rows of a development target, and nothing more for production", async () => {
        const pack = installExtensionPack();
        const s = await setup();
        await s.ready("dev");
        await vi.waitFor(() => expect(pack.msPython.activations).toBe(1));
        await s.kernel.project.selectTarget("prod");
        await s.ready("prod");
        expect(pack.msPython.activations).toBe(1);
        expect(pack.activated).toEqual([]);
        expect(
            vscode.executed.map((e) => e.command).filter((c) => /^(python|jupyter)\./.test(c)),
        ).toEqual([]);
        expect(vscode.debugSessions).toEqual([]);
        s.dispose();
    });

    it("keeps the listener count flat over target switches, deploys and sign-outs, also of Unity Gateway", async () => {
        const s = await setup();
        await s.ready("dev");
        const cycle = async () => {
            await s.kernel.project.selectTarget("prod");
            await s.ready("prod");
            await s.kernel.project.selectTarget("dev");
            await s.ready("dev");
            await vscode.commands.get("databricks.bundle.deploy")!();
            await s.settle();
            await s.kernel.connection.signOut();
            await when(s.kernel.connection.state, (c) => c.status === "signedOut");
            await s.kernel.connection.useProfile("DEFAULT");
            await s.ready("dev");
            await s.kernel.unityGateway.signIn("DEFAULT");
            await s.kernel.unityGateway.signOut();
        };
        // The first cycles create what lives for the session: caches, the
        // views' providers, the terminal-less trackers.
        await cycle();
        await cycle();
        const baseline = liveListenerCount();
        for (let i = 0; i < 10; i++) {
            await cycle();
        }
        expect(liveListenerCount()).toBe(baseline);
        s.dispose();
    }, 60_000);
});
