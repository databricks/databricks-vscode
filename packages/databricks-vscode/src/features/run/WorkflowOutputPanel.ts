import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Run, RunState } from "@databricks/sdk-jobs/v2";
import { Uri, type Disposable, type Event } from "vscode";
import { z } from "zod";
import type { Logger } from "../../platform/log";
import { WebviewHost, type WebviewPage } from "../../platform/ui/WebviewHost";

const VIEW_TYPE = "databricks-notebook-job-run";

/** What the page may send: "Refresh Results". Anything else is dropped (and logged) by `WebviewHost`. */
const PageMessage = z.object({
    command: z.literal("refresh_results"),
    args: z.object({ runId: z.union([z.string(), z.number()]).optional() }),
});
type PageMessage = z.infer<typeof PageMessage>;

/** The details column; `job.js`'s `updateDetails` renders it. */
export interface RunDetails {
    readonly runUrl: string;
    readonly runId: string;
    readonly serverless: boolean;
    readonly clusterUrl: string;
    readonly clusterId: string;
    readonly started: string;
    readonly ended: string;
    /** Milliseconds; -1 before the run starts. */
    readonly duration: number;
    readonly status: string;
}

type PanelMessage =
    | { fn: "updateDetails"; args: [RunDetails] }
    | { fn: "setOutputHtml"; args: [string] }
    | { fn: "setStdout"; args: [string] }
    | { fn: "setError"; args: [string, string | undefined] };

/**
 * The status the page shows; the e2e specs wait for "Succeeded". The old
 * mapping read only the life-cycle state, so a failed run also showed
 * "Succeeded", and a queued one "Unknown".
 */
export function runStatus(state: RunState | undefined): string {
    switch (state?.lifeCycleState) {
        case "QUEUED":
        case "PENDING":
        case "BLOCKED":
        case "WAITING_FOR_RETRY":
            return "Pending";
        case "RUNNING":
        case "TERMINATING":
            return "Running";
        case "TERMINATED":
            switch (state.resultState) {
                case undefined:
                case "SUCCESS":
                case "SUCCESS_WITH_FAILURES":
                    return "Succeeded";
                case "CANCELED":
                    return "Cancelled";
                case "TIMEDOUT":
                    return "Timed out";
                case "EXCLUDED":
                case "DISABLED":
                    return "Skipped";
                default:
                    return "Failed";
            }
        case "SKIPPED":
            return "Skipped";
        case "INTERNAL_ERROR":
            return "Failed";
        default:
            return "Unknown";
    }
}

const time = (ms: bigint | undefined) => (ms ? new Date(Number(ms)).toLocaleString() : "-");

/** The first task's details, as the old `updateState` computed them. */
export function runDetails(
    run: Run,
    host: string,
    clusterId: string | undefined,
    now = Date.now(),
): RunDetails {
    const task = run.tasks?.[0];
    const start = task?.startTime ? Number(task.startTime) : undefined;
    const end = task?.endTime ? Number(task.endTime) : undefined;
    const taskCluster = task?.clusterInstance;
    const base = host.replace(/\/+$/, "");
    const clusterUrl =
        clusterId === undefined || taskCluster === undefined
            ? "#"
            : taskCluster.sparkContextId
              ? `${base}/#setting/sparkui/${clusterId}/driver-${taskCluster.sparkContextId}`
              : `${base}/#setting/clusters/${clusterId}/sparkUi`;
    return {
        runUrl: run.runPageUrl ?? "",
        runId: task?.runId === undefined ? "N/A" : String(task.runId),
        serverless: clusterId === undefined,
        clusterUrl,
        clusterId: taskCluster?.clusterId || "-",
        started: time(task?.startTime),
        ended: time(task?.endTime),
        duration: start === undefined ? -1 : (end !== undefined && end > start ? end : now) - start,
        status: runStatus(run.state),
    };
}

/**
 * The exported notebook loads its renderer from Databricks' CDN and runs
 * inline scripts. Its `srcdoc` frame inherits the page's policy, so the
 * policy lets through scripts with the nonce (the page gives the notebook's
 * scripts the nonce) and what they load, and styles, fonts and images over
 * HTTPS. The frame's sandbox has no `allow-same-origin`, so the notebook
 * can't reach the page or `acquireVsCodeApi`.
 */
const NOTEBOOK_CSP: Readonly<Record<string, readonly string[]>> = {
    "script-src": ["'strict-dynamic'", "'unsafe-eval'", "https:"],
    "style-src": ["https:"],
    "font-src": ["https:", "data:"],
    "img-src": ["https:", "blob:"],
    "connect-src": ["https:"],
};

/**
 * The "Databricks Job Run" panel (RUN-02), on `WebviewHost`, with the old
 * `job.html` page. The e2e specs read its `aria-label`s `task-run-id`,
 * `run-start-time` and `run-status`, and its frame `#frame`.
 */
export class WorkflowOutputPanel implements Disposable {
    private refresh: ((runId: string | number | undefined) => void) | undefined;

    private constructor(
        private readonly host: WebviewHost<PageMessage, PanelMessage>,
        private readonly page: WebviewPage,
    ) {
        host.onMessage((message) => this.refresh?.(message.args.runId));
        this.reset();
    }

    static async create(
        extensionPath: string,
        fileName: string,
        log: Logger,
    ): Promise<WorkflowOutputPanel> {
        const dir = path.join(extensionPath, "resources", "webview-ui");
        const [template, css, script] = await Promise.all([
            readFile(path.join(dir, "job.html"), "utf-8"),
            readFile(path.join(dir, "job.css"), "utf-8"),
            readFile(path.join(dir, "job.js"), "utf-8"),
        ]);
        const host = new WebviewHost<PageMessage, PanelMessage>({
            viewType: VIEW_TYPE,
            title: `${fileName} - Databricks Job Run`,
            localResourceRoots: [Uri.file(path.join(extensionPath, "resources"))],
            messages: PageMessage,
            log,
        });
        return new WorkflowOutputPanel(host, {
            template,
            styles: [css],
            scripts: [script],
            csp: NOTEBOOK_CSP,
        });
    }

    get onDidDispose(): Event<void> {
        return this.host.onDidDispose;
    }

    get visible(): boolean {
        return this.host.visible;
    }

    /** A fresh page for another run; the previous run's "Refresh Results" is forgotten. */
    reset(): void {
        this.refresh = undefined;
        this.host.render(this.page);
    }

    focus(): void {
        this.host.reveal();
    }

    onRefreshResults(handler: (runId: string | number | undefined) => void): void {
        this.refresh = handler;
    }

    updateDetails(details: RunDetails): void {
        this.host.post({ fn: "updateDetails", args: [details] });
    }

    showExportedRun(html: string): void {
        this.host.post({ fn: "setOutputHtml", args: [html] });
    }

    showStdout(output: string): void {
        this.host.post({ fn: "setStdout", args: [output] });
    }

    showError(message: string, stack?: string): void {
        this.host.post({ fn: "setError", args: [message, stack] });
    }

    dispose(): void {
        this.host.dispose();
    }
}
