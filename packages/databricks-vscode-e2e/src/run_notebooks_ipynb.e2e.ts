import path from "node:path";
import * as fs from "fs/promises";
import assert from "node:assert";
import { executeCommandWhenAvailable, waitForLogin } from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import { openFile } from "./utils/editor.ts";
import { waitForWorkflowWebview } from "./utils/workflow.ts";
import { getBasicBundleConfig, writeRootBundleConfig } from "./utils/bundle-fixtures.ts";

// We split py and ipynb suites to avoid tests failing on GH workflows,
// likely because the tests open webviews which are heavy on resources.
/*
 * Ported from the frozen suite. The body is verbatim; the imports differ:
 * the helpers are in this package's `utils/`.
 */
describe("Run ipynb notebooks", async function () {
    let projectDir: string;
    this.timeout(3 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH);
        projectDir = process.env.WORKSPACE_PATH;

        await fs.writeFile(
            path.join(projectDir, "lib.py"),
            ["def func(spark):", `\tspark.sql('SELECT "hello world"').show()`].join("\n"),
        );
        await fs.mkdir(path.join(projectDir, "a", "b c"), {
            recursive: true,
        });
        await fs.writeFile(
            path.join(projectDir, "notebook.ipynb"),
            JSON.stringify({
                /* eslint-disable @typescript-eslint/naming-convention */
                cells: [
                    {
                        cell_type: "code",
                        execution_count: null,
                        metadata: {},
                        outputs: [],
                        source: [`from lib import func`, "func(spark)"],
                    },
                ],
                metadata: {
                    kernelspec: {
                        display_name: "Python 3",
                        language: "python",
                        name: "python3",
                    },
                    orig_nbformat: 4,
                },
                nbformat: 4,
                nbformat_minor: 2,
                /* eslint-enable @typescript-eslint/naming-convention */
            }),
        );
        await writeRootBundleConfig(getBasicBundleConfig(), projectDir);
    });

    it("should wait for connection", async () => {
        await waitForLogin("DEFAULT");
        await dismissNotifications();
    });

    it("should run a notebook.ipynb file as a workflow", async () => {
        await openFile("notebook.ipynb");
        await executeCommandWhenAvailable("Databricks: Run File as Workflow");
        await waitForWorkflowWebview("hello world");
    });
});
