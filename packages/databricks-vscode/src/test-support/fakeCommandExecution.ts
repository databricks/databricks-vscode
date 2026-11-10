import type { HttpRequest } from "@databricks/sdk-core/http";
import type { FakeHttpClient, FakeResponse } from "./fakeHttp";

/** What a finished command returns, as the 1.2 API sends it. */
export interface FakeCommandResult {
    readonly status?: string;
    readonly results?: Record<string, unknown>;
}

const body = async (request: HttpRequest): Promise<Record<string, string>> =>
    JSON.parse(
        typeof request.body === "string"
            ? request.body
            : await new Response(request.body ?? "{}").text(),
    ) as Record<string, string>;

/**
 * The Command Execution API (1.2) over memory: contexts start `Pending`,
 * then run; a command stays `Running` for `pollsUntilDone` polls, then
 * returns `result`. It records the commands and what was cancelled and
 * destroyed.
 */
export class FakeCommandExecution {
    readonly commands: {
        clusterId: string;
        contextId: string;
        language: string;
        command: string;
    }[] = [];
    readonly cancelled: string[] = [];
    readonly destroyed: string[] = [];
    readonly contexts: { clusterId: string; language: string }[] = [];
    result: FakeCommandResult = { status: "Finished", results: { resultType: "text", data: "" } };
    pollsUntilDone = 1;
    contextPolls = 1;
    /** Called when a command is polled while still running, so a test can act mid-run. */
    onRunning?: () => void;
    private polls = new Map<string, number>();
    private next = 1;

    install(http: FakeHttpClient): FakeHttpClient {
        return http
            .on("POST", "/api/1.2/contexts/create", async (r) => {
                const { clusterId, language } = await body(r);
                this.contexts.push({ clusterId: clusterId!, language: language! });
                return { body: { id: `ctx-${this.next++}` } };
            })
            .on("GET", "/api/1.2/contexts/status", (r) => {
                const id = new URL(r.url).searchParams.get("contextId")!;
                return {
                    body: { id, status: this.poll(id) > this.contextPolls ? "Running" : "Pending" },
                };
            })
            .on("POST", "/api/1.2/contexts/destroy", async (r) => {
                this.destroyed.push((await body(r)).contextId!);
                return { body: {} };
            })
            .on("POST", "/api/1.2/commands/execute", async (r) => {
                const { clusterId, contextId, language, command } = await body(r);
                this.commands.push({
                    clusterId: clusterId!,
                    contextId: contextId!,
                    language: language!,
                    command: command!,
                });
                return { body: { id: `cmd-${this.next++}` } };
            })
            .on("GET", "/api/1.2/commands/status", (r): FakeResponse => {
                const id = new URL(r.url).searchParams.get("commandId")!;
                if (this.cancelled.includes(id)) {
                    return { body: { id, status: "Cancelled" } };
                }
                if (this.poll(id) <= this.pollsUntilDone) {
                    this.onRunning?.();
                    return { body: { id, status: "Running" } };
                }
                return { body: { id, ...this.result } };
            })
            .on("POST", "/api/1.2/commands/cancel", async (r) => {
                this.cancelled.push((await body(r)).commandId!);
                return { body: {} };
            });
    }

    private poll(id: string): number {
        const count = (this.polls.get(id) ?? 0) + 1;
        this.polls.set(id, count);
        return count;
    }
}
