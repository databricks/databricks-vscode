import { readFileSync } from "node:fs";
import path from "node:path";
import { newPatCredentials } from "@databricks/sdk-auth/credentials";
import { describe, expect, it } from "vitest";
import type { ClusterDetails } from "../../kernel/compute/clusters";
import type { Compute } from "../../kernel/compute/effectiveCompute";
import { ApiClients } from "../../kernel/connection/ApiClients";
import type { Connection } from "../../kernel/connection/ConnectionService";
import { CancelledError } from "../../platform/errors";
import { FakeCommandExecution } from "../../test-support/fakeCommandExecution";
import { fakeLog } from "../../test-support/fakes";
import { FakeHttpClient } from "../../test-support/fakeHttp";
import { ClusterRunner, type RunOutput } from "./ClusterRunner";
import { STDOUT_ERROR_BOUNDARY } from "./ErrorParser";
import type { RunContext, RunTarget } from "./RunContext";

const HOST = "https://a.cloud.databricks.com";
const ROOT = path.join(path.sep, "Desktop", "workspaces");
const REMOTE = "/Workspace/Users/me/.bundle/demo/dev/files";
const BOOTSTRAP = readFileSync(
    path.resolve(__dirname, "../../../resources/python/bootstrap.py"),
    "utf-8",
);
const PROGRAM = path.join(ROOT, "nested dir", "hello.py");

function running(id = "cluster-1", state = "RUNNING"): ClusterDetails {
    return { id, name: "shared", state };
}

/** A run context over fakes; the events say what happened in which order. */
function setup(
    options: {
        mode?: string;
        target?: Partial<RunTarget>;
        compute?: Compute | null;
        cluster?: ClusterDetails;
        upload?: (signal: AbortSignal) => Promise<void>;
    } = {},
) {
    const http = new FakeHttpClient();
    const commands = new FakeCommandExecution();
    commands.install(http);
    const connection = {
        host: HOST,
        api: new ApiClients({
            host: HOST,
            credentials: newPatCredentials("dapi-1"),
            httpClient: http,
        }),
    } as unknown as Connection;
    const events: string[] = [];
    const errors: string[] = [];
    const ctx: RunContext = {
        log: fakeLog(),
        connection: async (_signal, onWait) => {
            onWait?.();
            return connection;
        },
        target: async () => ({
            mode: options.mode ?? "development",
            destination: { localRoot: ROOT, remoteRoot: REMOTE },
            ...options.target,
        }),
        progress: (signal, task) => task(signal, () => {}),
        upload: async (signal) => {
            events.push("upload");
            await options.upload?.(signal);
        },
        focusDebugConsole: async () => void events.push("focus"),
        compute: () =>
            options.compute === null
                ? undefined
                : (options.compute ?? {
                      kind: "cluster",
                      clusterId: "cluster-1",
                      source: "bundle",
                  }),
        getCluster: async (clusterId) => options.cluster ?? running(clusterId),
        prompts: {
            changeTargetMode: (mode) => events.push(`prompt: change target mode (${mode})`),
            attachCluster: () => events.push("prompt: attach cluster"),
            startCluster: () => events.push("prompt: start cluster"),
        },
        readResource: async (name) => {
            expect(name).toBe("bootstrap.py");
            return BOOTSTRAP;
        },
        rearrangeCells: () => true,
        showError: (message) => errors.push(message),
    };
    const outputs: RunOutput[] = [];
    const runner = new ClusterRunner(ctx, { pollIntervalMs: 1, now: () => 0 });
    const run = (
        request: { args?: string[]; env?: Record<string, string> } = {},
        signal = new AbortController().signal,
    ) => runner.run({ program: PROGRAM, ...request }, signal, (o) => outputs.push(o));
    const texts = () => outputs.map((o) => o.text.replace(/^.* - /, ""));
    /** The arguments `bootstrap.py` reads, from the command's first line. */
    const config = () => {
        const firstLine = commands.commands[0]!.command.split("\n")[0]!;
        return JSON.parse(
            JSON.parse(firstLine.replace(/^__databricks_bootstrap_config = /, "")) as string,
        ) as Record<string, unknown>;
    };
    return { http, commands, runner, run, outputs, texts, events, errors, config };
}

// The old `DatabricksRuntime.test.ts` (commented out since the Repos era), against fakes.
describe("ClusterRunner", () => {
    it("runs a file: uploads, creates a context, runs bootstrap.py, prints the output and destroys the context", async () => {
        const s = setup();
        s.commands.result = {
            status: "Finished",
            results: { resultType: "text", data: "+-----------+\n|hello world|\n+-----------+" },
        };

        expect(await s.run()).toBe(0);

        expect(s.texts()).toEqual([
            "Connecting to databricks...",
            "Uploading assets to databricks workspace...",
            "Creating execution context on cluster cluster-1 ...",
            "Running nested dir/hello.py ...\n",
            "+-----------+\n|hello world|\n+-----------+",
            "Done (took 0ms)",
        ]);
        expect(s.events).toEqual(["upload", "focus"]);
        expect(s.commands.contexts).toEqual([{ clusterId: "cluster-1", language: "python" }]);
        expect(s.commands.commands[0]).toMatchObject({
            clusterId: "cluster-1",
            contextId: "ctx-1",
            language: "python",
        });
        expect(s.commands.destroyed).toEqual(["ctx-1"]);
        expect(s.runner.state).toBe("FINISHED");
        expect(s.errors).toEqual([]);
    });

    it("gives bootstrap.py its arguments as JSON: the remote file, the project, argv and env", async () => {
        const s = setup();
        await s.run({ args: ["--name", 'it\'s "quoted"\\'], env: { TEST: "TEST" } });

        expect(s.config()).toEqual({
            python_file: `${REMOTE}/nested dir/hello.py`,
            repo_path: REMOTE,
            args: [`${REMOTE}/nested dir/hello.py`, "--name", 'it\'s "quoted"\\'],
            env: { TEST: "TEST" },
            stdout_error_boundary: STDOUT_ERROR_BOUNDARY,
        });
        // The script itself is unchanged.
        expect(s.commands.commands[0]!.command.split("\n").slice(1).join("\n")).toBe(BOOTSTRAP);
    });

    it("has an empty env without env vars", async () => {
        const s = setup();
        await s.run();
        expect(s.config().env).toEqual({});
    });

    it("refuses an env name the bootstrap can't set", async () => {
        const s = setup();
        expect(await s.run({ env: { "BAD-NAME": "x" } })).toBe(1);
        expect(s.errors).toEqual([
            "Error: Invalid environment variable BAD-NAME: Only lower and upper case letters, digits and '_'(underscore) are allowed.",
        ]);
        expect(s.events).toEqual([]);
    });

    it("handles failed executions: the traceback, with the bundle's files mapped to local ones", async () => {
        const s = setup();
        s.commands.result = {
            status: "Finished",
            results: {
                resultType: "error",
                summary: "<span class='ansi-red-fg'>Exception</span>: juhu",
                cause: `\u001b[0;31mException\u001b[0m   Traceback (most recent call last)\n\n\u001b[0;32m${REMOTE}/nested dir/hello.py\u001b[0m in \u001b[0;36m<module>\u001b[0;34m\u001b[0m\n\u001b[0;32m---> 3\u001b[0;31m raise Exception("juhu")\n\n\u001b[0;31mException\u001b[0m: juhu`,
            },
        };

        expect(await s.run()).toBe(0);

        const frame = s.outputs.find((o) => o.text.includes("juhu") && o.line > 0);
        expect(frame).toMatchObject({ filePath: PROGRAM, line: 3 });
        expect(frame?.text).toContain(PROGRAM);
        expect(s.texts()).toContain("\u001b[0;31mException\u001b[0m: juhu");
    });

    it("prints what the script printed before it failed, then the structured traceback", async () => {
        const s = setup();
        const envelope = {
            type: "ValueError",
            message: "boom",
            frames: [
                {
                    file: `${REMOTE}/nested dir/hello.py`,
                    line: 4,
                    name: "<module>",
                    text: "raise ValueError()",
                },
            ],
        };
        s.commands.result = {
            status: "Finished",
            results: {
                resultType: "text",
                data: `printed\n\n${STDOUT_ERROR_BOUNDARY}\n${JSON.stringify(envelope)}`,
            },
        };

        await s.run();

        expect(s.texts()).toContain("printed\n\n");
        expect(s.outputs.find((o) => o.line === 4)).toMatchObject({ filePath: PROGRAM });
        expect(s.texts()).toContain("\u001b[0;31mValueError: boom\u001b[0m");
    });

    it("runs only on a development target", async () => {
        const s = setup({ mode: "production" });
        expect(await s.run()).toBe(1);
        expect(s.events).toEqual(["prompt: change target mode (production)"]);
        expect(s.commands.commands).toEqual([]);
    });

    it("needs a sync destination", async () => {
        const s = setup({ target: { destination: undefined } });
        expect(await s.run()).toBe(1);
        expect(s.errors).toEqual(["Error: No sync destination found"]);
    });

    it("prompts to attach a cluster when there is none, or serverless is chosen", async () => {
        for (const compute of [null, { kind: "serverless", source: "override" } as const]) {
            const s = setup({ compute });
            expect(await s.run()).toBe(1);
            expect(s.events).toEqual(["upload", "focus", "prompt: attach cluster"]);
        }
    });

    it("prompts to start a cluster that isn't running, after a fresh read", async () => {
        const s = setup({ cluster: running("cluster-1", "TERMINATED") });
        expect(await s.run()).toBe(1);
        expect(s.events).toEqual(["upload", "focus", "prompt: start cluster"]);
        expect(s.commands.contexts).toEqual([]);
    });

    it("prints Cancelled, and nothing else, when the upload is cancelled", async () => {
        const s = setup({ upload: () => Promise.reject(new CancelledError()) });
        expect(await s.run()).toBe(1);
        expect(s.texts().at(-1)).toBe("Cancelled");
        expect(s.outputs.at(-1)?.type).toBe("err");
        expect(s.errors).toEqual([]);
        expect(s.runner.state).toBe("CANCELED");
    });

    it("reports a failed upload with the old message", async () => {
        const s = setup({ upload: () => Promise.reject(new Error("Error: no permission")) });
        expect(await s.run()).toBe(1);
        expect(s.errors).toEqual([
            "Error: Error synchronising bundle assets. Error: no permission",
        ]);
    });

    it("cancels the command, and destroys the context, when stopped during execution", async () => {
        const s = setup();
        const controller = new AbortController();
        s.commands.pollsUntilDone = 1000;
        s.commands.onRunning = () => controller.abort();

        expect(await s.run({}, controller.signal)).toBe(1);

        await expect.poll(() => s.commands.cancelled).toEqual(["cmd-2"]);
        expect(s.commands.destroyed).toEqual(["ctx-1"]);
        expect(s.texts().at(-1)).toBe("Cancelled");
    });
});
