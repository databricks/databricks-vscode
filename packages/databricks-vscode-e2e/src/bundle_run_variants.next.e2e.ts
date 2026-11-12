import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import type { CustomTreeSection } from "wdio-vscode-service";
import {
    getBasicBundleConfig,
    getSimpleJobsResource,
    getUniqueResourceName,
    writeRootBundleConfig,
} from "./utils/bundle-fixtures.ts";
import { getActionButton, waitForInput, waitForLogin } from "./utils/configuration.ts";
import { openContextMenu } from "./utils/context-menu.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import {
    getResourceViewItem,
    waitForDeployment,
    waitForResourcesGroup,
    waitForRunStatus,
} from "./utils/explorer.ts";
import { elements, getViewSection } from "./utils/view.ts";
import { WorkspaceClient, type PipelineUpdate } from "./utils/workspace-client.ts";

/**
 * The pipeline run variants (BNDL-10), cancelling a run
 * (BNDL-11), and the explorer's "Go to definition" and "Copy" (BNDL-07,
 * INFRA-07), which no frozen spec covers. The bundle has the frozen suite's
 * pipeline and a job whose notebook sleeps for five minutes (the mock keeps
 * a job named `…_slow…` running), so the run can be cancelled while it runs.
 * The API says what each update was.
 */
/** The pipeline's materialized view, which a partial update can refresh. */
const TABLE = "vscode_integration_test.test_table";

describe("Pipeline run variants and cancelling a run", async function () {
    let explorer: CustomTreeSection;
    let pipelineName: string;
    let jobName: string;
    let client: WorkspaceClient;

    // The real pipeline waits for its cluster.
    this.timeout(30 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        assert(process.env.TEST_DEFAULT_CLUSTER_ID, "TEST_DEFAULT_CLUSTER_ID doesn't exist");
        const root = process.env.WORKSPACE_PATH;
        pipelineName = getUniqueResourceName("run_variants_pipeline");
        const job = getSimpleJobsResource({
            tasks: [
                {
                    task_key: "sleep",
                    notebook_task: { notebook_path: "src/sleep.ipynb" },
                    existing_cluster_id: process.env.TEST_DEFAULT_CLUSTER_ID,
                },
            ],
        });
        job.name = getUniqueResourceName("run_variants_slow_job");
        jobName = job.name;
        await writeRootBundleConfig(
            getBasicBundleConfig({
                bundle: { name: getUniqueResourceName("run_variants"), deployment: {} },
                targets: {
                    dev_test: {
                        resources: {
                            jobs: { slow_job: job },
                            pipelines: {
                                vscode_integration_test: {
                                    name: pipelineName,
                                    target: "vscode_integration_test",
                                    clusters: [
                                        {
                                            label: "default",
                                            policy_id: "001196FD671F30D0",
                                            apply_policy_default_values: true,
                                        },
                                    ],
                                    libraries: [{ notebook: { path: "src/notebook.ipynb" } }],
                                },
                            },
                        },
                    },
                },
            }),
            root,
        );
        await fs.mkdir(path.join(root, "src"), { recursive: true });
        await fs.copyFile(
            path.join(import.meta.dirname, "resources/dlt_pipeline.ipynb"),
            path.join(root, "src", "notebook.ipynb"),
        );
        await fs.copyFile(
            path.join(import.meta.dirname, "resources/sleep_300.ipynb"),
            path.join(root, "src", "sleep.ipynb"),
        );
        client = new WorkspaceClient({ profile: "DEFAULT" });
        await waitForLogin("DEFAULT");
        await dismissNotifications();
        const section = await getViewSection("PROJECT");
        assert(section, "PROJECT view doesn't exist");
        await waitForResourcesGroup(section as CustomTreeSection);
        explorer = section as CustomTreeSection;
    });

    async function clickInline(type: "Jobs" | "Pipelines", name: string, label: string) {
        // The resource's row can show after the Resources group does.
        const item = await browser
            .waitUntil(() => getResourceViewItem(explorer, type, name), {
                timeout: 30_000,
                interval: 1_000,
            })
            .catch(() => undefined);
        assert(item, `${name} isn't in the explorer`);
        await item.elem.moveTo();
        const button = await getActionButton(item, label);
        assert(button, `${name} has no "${label}" action`);
        await button.click();
    }

    async function clearBundleLogs() {
        const output = await (await browser.getWorkbench()).getBottomBar().openOutputView();
        await output.selectChannel("Databricks Bundle Logs");
        await output.clearText();
    }

    /** The pipeline's newest update. */
    async function latestUpdate(): Promise<PipelineUpdate> {
        const id = await client.pipelines.idByName(pipelineName);
        assert(id, `${pipelineName} isn't deployed`);
        const [update] = await client.pipelines.listUpdates(id);
        assert(update, `${pipelineName} has no updates`);
        return update;
    }

    it("should open a resource's definition in the bundle file (BNDL-07, INFRA-07)", async () => {
        await clickInline("Jobs", jobName, "Go to definition");
        // The editor opens first, then gets the selection: wait for both.
        let last: { file: string; line: string } | undefined;
        // The CLI locates a resource at its mapping, which starts with its first key.
        const onTheJob = (o: { line: string }) =>
            o.line.includes("slow_job:") || o.line.includes(jobName);
        const opened = await browser
            .waitUntil(
                async () => {
                    last = await browser.executeWorkbench((vscode) => {
                        const editor = vscode.window.activeTextEditor;
                        return editor === undefined
                            ? undefined
                            : {
                                  file: editor.document.uri.fsPath,
                                  line: editor.document.lineAt(editor.selection.start.line).text,
                              };
                    });
                    return last !== undefined && onTheJob(last) ? last : undefined;
                },
                { timeout: 20_000 },
            )
            .catch((e: unknown) => {
                throw new Error(`The selection never got to the job: ${JSON.stringify(last)}`, {
                    cause: e,
                });
            });
        assert.strictEqual(path.basename(opened.file), "databricks.yml");
        await (await browser.getWorkbench()).getEditorView().closeAllEditors();
    });

    it("should copy a resource's name (INFRA-07)", async () => {
        const item = await getResourceViewItem(explorer, "Jobs", jobName);
        assert(item, `${jobName} isn't in the explorer`);
        await (await openContextMenu(item)).select("Copy");
        await browser.waitUntil(
            async () =>
                (
                    await browser.executeWorkbench((vscode) => vscode.env.clipboard.readText())
                ).includes(jobName),
            { timeout: 10_000, timeoutMsg: "The clipboard doesn't hold the job's name" },
        );
    });

    it("should deploy and validate the pipeline (BNDL-10)", async () => {
        await clearBundleLogs();
        await clickInline("Pipelines", pipelineName, "Deploy the bundle and validate the pipeline");
        await waitForDeployment();
        await waitForRunStatus(explorer, "Pipelines", pipelineName, "Success", 20 * 60 * 1000);
        assert.strictEqual(
            (await latestUpdate()).validate_only,
            true,
            "The update wasn't validate-only",
        );
    });

    it("should update only the tables picked (BNDL-10)", async () => {
        await clearBundleLogs();
        await clickInline(
            "Pipelines",
            pipelineName,
            "Deploy the bundle and select pipeline tables for partial update",
        );
        const input = await waitForInput();
        // The validation found the pipeline's datasets; the view isn't offered,
        // only the materialized view. The picker allows
        // several, and starts with a separator, which the service's
        // quick-pick helpers trip on, so the row is found by its text.
        let row: WebdriverIO.Element | undefined;
        await browser.waitUntil(
            async () => {
                for (const r of await elements(".quick-input-widget .monaco-list-row")) {
                    if ((await r.getText()).split("\n")[0]?.trim() === TABLE) {
                        row = r;
                        return true;
                    }
                }
                return false;
            },
            { timeout: 30_000, timeoutMsg: `The table picker doesn't offer ${TABLE}` },
        );
        // A click on the row toggles its checkbox.
        await row!.click();
        await input.confirm();
        await waitForDeployment();
        await waitForRunStatus(explorer, "Pipelines", pipelineName, "Success", 20 * 60 * 1000);
        const update = await latestUpdate();
        assert.deepStrictEqual(update.refresh_selection, [TABLE]);
        assert.notStrictEqual(update.validate_only, true);
    });

    it("should cancel a running job (BNDL-11)", async () => {
        await clearBundleLogs();
        await clickInline("Jobs", jobName, "Deploy the bundle and run the job");
        await waitForDeployment();
        let status: string | undefined;
        await browser.waitUntil(
            async () => {
                const item = await getResourceViewItem(explorer, "Jobs", jobName);
                status = await (await item?.findChildItem("Run Status"))?.getDescription();
                return status === "Pending" || status === "Running";
            },
            {
                timeout: 120_000,
                interval: 1_000,
                timeoutMsg: `The job never started; its status is ${status}`,
            },
        );
        await clickInline("Jobs", jobName, "Cancel run");
        await waitForRunStatus(explorer, "Jobs", jobName, "Cancelled", 5 * 60 * 1000);
    });
});
