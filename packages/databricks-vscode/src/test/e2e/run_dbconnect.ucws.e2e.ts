import path from "node:path";
import * as fs from "fs/promises";
import assert from "node:assert";
import {
    dismissNotifications,
    executeCommandWhenAvailable,
    getTreeViewItems,
    openFile,
    waitForInput,
    waitForLogin,
    waitForNotification,
} from "./utils/commonUtils.ts";
import {
    getBasicBundleConfig,
    writeRootBundleConfig,
} from "./utils/dabsFixtures.ts";

// Recursively lists every file under `dir` (relative paths), so we can see
// where an output file actually landed vs. where the test looked for it.
async function listFilesRecursive(dir: string, base = dir): Promise<string[]> {
    const out: string[] = [];
    let entries;
    try {
        entries = await fs.readdir(dir, {withFileTypes: true});
    } catch {
        return out;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            // Skip the venv — it holds thousands of files and none are outputs.
            if (entry.name === ".venv" || entry.name === ".databricks") {
                continue;
            }
            out.push(...(await listFilesRecursive(full, base)));
        } else {
            out.push(path.relative(base, full));
        }
    }
    return out;
}

// Dumps whatever we can observe about the notebook run when an output file
// never shows up (or never gets the expected content). Runs only on failure,
// so the extra work never slows down the happy path.
//
// It answers the two questions a missing output file raises: (1) did the cell
// write the file somewhere else? — we list the whole workspace tree, since a
// cwd mismatch would drop it in the project root rather than `nested/`; and
// (2) did the cell error out? — the notebook kernel logs to its own VS Code
// Output channel (not the default one), so we enumerate every channel and dump
// each, which surfaces a NameError/kernel failure wherever it landed.
async function dumpNotebookDiagnostics(
    filePath: string,
    expectedContent: string,
    lastContent: string | undefined
) {
    console.log(
        `=== checkOutputFile diagnostics for "${filePath}" ` +
            `(expected to contain "${expectedContent}") ===`
    );
    console.log(
        "last file content observed:",
        lastContent ?? "<file never appeared>"
    );

    // Full workspace tree (relative to WORKSPACE_PATH). If the cell ran but
    // wrote to the wrong cwd, the *-output.json shows up here under a different
    // directory than the one the test polled.
    if (process.env.WORKSPACE_PATH) {
        try {
            const files = await listFilesRecursive(process.env.WORKSPACE_PATH);
            console.log(
                `workspace tree under "${process.env.WORKSPACE_PATH}":`,
                files
            );
        } catch (e) {
            console.log("could not walk the workspace tree:", e);
        }
    }

    // Every Output channel, so the notebook kernel's cell error (which does not
    // go to the default channel) is captured rather than whatever channel
    // happens to be selected.
    try {
        const workbench = await browser.getWorkbench();
        const view = await workbench.getBottomBar().openOutputView();
        let channels: string[] = [];
        try {
            channels = await view.getChannelNames();
        } catch (e) {
            console.log("could not list Output channels:", e);
        }
        console.log("=== Output channels available ===", channels);
        for (const channel of channels) {
            try {
                await view.selectChannel(channel);
                const text = (await view.getText()).join("\n");
                console.log(`=== Output channel "${channel}" ===\n${text}`);
            } catch (e) {
                console.log(`could not read Output channel "${channel}":`, e);
            }
        }
    } catch (e) {
        console.log("could not read the Output panel:", e);
    }
}

// Polls until `filePath` exists and contains `expectedContent`. A missing file
// is a normal "not ready yet" (the notebook writes it asynchronously), so we
// keep polling instead of letting the ENOENT abort the wait — that way a
// genuine timeout surfaces the readable `timeoutMsg` rather than a raw ENOENT
// stack, and any other IO error still propagates. On failure we dump
// diagnostics before rethrowing so CI logs show why the output never landed.
async function checkOutputFile(
    filePath: string,
    expectedContent: string,
    timeout = 120_000
) {
    let lastContent: string | undefined;
    try {
        await browser.waitUntil(
            async () => {
                try {
                    lastContent = await fs.readFile(filePath, "utf-8");
                } catch {
                    // Any read error is treated as a transient poll-miss: the
                    // file may not exist yet (ENOENT), or on the Windows shard a
                    // concurrent writer / antivirus scan can briefly share-lock
                    // it (EPERM/EBUSY/EACCES) right after creation. A file that
                    // stays unreadable still fails with the readable
                    // `timeoutMsg`, and `dumpNotebookDiagnostics` runs on that
                    // timeout — so we never abort with a raw errno stack.
                    return false;
                }
                console.log(`"${filePath}" contents: `, lastContent);
                return lastContent.includes(expectedContent);
            },
            {
                timeout,
                interval: 2000,
                timeoutMsg:
                    `Output file "${filePath}" did not contain ` +
                    `"${expectedContent}" within ${timeout}ms`,
            }
        );
    } catch (e) {
        await dumpNotebookDiagnostics(filePath, expectedContent, lastContent);
        throw e;
    }
    await fs.rm(filePath);
}

describe("Run files on serverless compute", async function () {
    let projectDir: string;
    this.timeout(12 * 60 * 1000);

    before(async () => {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");

        projectDir = process.env.WORKSPACE_PATH;

        await fs.writeFile(
            path.join(projectDir, "requirements.txt"),
            ["ipykernel", "setuptools"].join("\n")
        );

        await fs.writeFile(
            path.join(projectDir, "lib.py"),
            `def func(spark):\treturn spark.sql('SELECT "hello world"')`
        );
        const nestedDir = path.join(projectDir, "nested");
        await fs.mkdir(nestedDir, {recursive: true});
        await fs.writeFile(
            path.join(nestedDir, "hello.py"),
            [
                `from lib import func`,
                `import os`,
                `df = func(spark).toPandas()`,
                `df.to_json(os.path.join(os.getcwd(), "file-output.json"))`,
            ].join("\n")
        );

        await fs.writeFile(
            path.join(nestedDir, "notebook.ipynb"),
            JSON.stringify({
                /* eslint-disable @typescript-eslint/naming-convention */
                cells: [
                    {
                        cell_type: "code",
                        execution_count: null,
                        metadata: {},
                        outputs: [],
                        source: [
                            `from lib import func`,
                            `import os`,
                            `df = func(spark).toPandas()`,
                            `df.to_json(os.path.join(os.getcwd(), "notebook-output.json"))`,
                        ],
                    },
                    {
                        cell_type: "code",
                        execution_count: null,
                        metadata: {},
                        outputs: [],
                        source: [`%run "./hello.py"`],
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
            })
        );

        await fs.writeFile(
            path.join(nestedDir, "databricks-run-notebook.py"),
            [
                "# Databricks notebook source",
                "# DBTITLE 1,My cell title",
                "# MAGIC %sql",
                "# MAGIC select 1 + 1;",
                "# MAGIC select 'hello run;'",
                "# COMMAND ----------",
                `import os`,
                `df = _sqldf.toPandas()`,
                `df.to_json(os.path.join(os.getcwd(), "databricks-run-notebook-output.json"))`,
            ].join("\n")
        );

        await fs.writeFile(
            path.join(nestedDir, "databricks-notebook.py"),
            [
                "# Databricks notebook source",
                `import os`,
                `spark.sql('SELECT "hello world"').show()`,
                "# COMMAND ----------",
                "# DBTITLE 1,My cell title",
                "# MAGIC %sql",
                "# MAGIC select 1 + 1;",
                "# MAGIC select 'hello; world'",
                "# COMMAND ----------",
                `df = _sqldf.toPandas()`,
                `df.to_json(os.path.join(os.getcwd(), "databricks-notebook-output.json"))`,
                "# COMMAND ----------",
                "# MAGIC %run './databricks-run-notebook.py'",
            ].join("\n")
        );

        await writeRootBundleConfig(
            getBasicBundleConfig({}, false),
            projectDir
        );
    });

    it("should wait for connection", async () => {
        await waitForLogin("DEFAULT");
        await dismissNotifications();
        const workbench = await driver.getWorkbench();
        await workbench.getEditorView().closeAllEditors();
    });

    it("should prompt to setup virtual environment", async () => {
        const subTreeItems = await getTreeViewItems(
            "CONFIGURATION",
            "Python Environment"
        );
        let promptFound = false;
        for (const item of subTreeItems) {
            const label = await item.getLabel();
            console.log("Python Environment item label: ", label);
            if (label.includes("Activate an environment")) {
                promptFound = true;
                break;
            }
        }
        assert(promptFound, "Prompt to setup virtual environment not found");
    });

    it("should select serverless compute", async () => {
        await executeCommandWhenAvailable("Databricks: Configure cluster");
        const computeInput = await waitForInput();
        await computeInput.selectQuickPick("Serverless");
    });

    it("should setup virtual environment", async () => {
        await executeCommandWhenAvailable(
            "Databricks: Setup python environment"
        );

        // Remote runner has miniconda environment preinstalled,
        // but we still want to create a local .venv to test the full flow
        const selectEnvInput = await waitForInput();
        const createNewPick = await selectEnvInput.findQuickPick(
            "Create new environment"
        );
        if (createNewPick) {
            console.log("'Create new environment' pick found, selecting");
            await createNewPick.select();
        } else {
            console.log("'Create new environment' pick not found, moving on");
        }

        // Select Venv as the environment manager
        const envTypeInput = await waitForInput();
        await envTypeInput.selectQuickPick("Venv");
        console.log("Selected Venv as the environment manager");

        // Our runners have python 3.12+ preinstalled
        const pythonVersionInput = await waitForInput();
        await pythonVersionInput.selectQuickPick("Python 3.12");
        console.log("Selected Python Version");

        // Install dependencies from the requirements.txt
        const dependenciesInput = await waitForInput();
        try {
            await dependenciesInput.toggleAllQuickPicks(true);
        } catch (e) {
            console.log(
                "Failed to toggle all quick picks, moving on. Error:",
                e
            );
        }
        await dependenciesInput.confirm();

        // On Windows the "The following environment is selected" notification
        // sometimes never surfaces before the next one arrives (same class of
        // issue as the "installation finished" notification handled below,
        // TODO: fix in the extension code). It is only used as an ordering hint
        // — the "Databricks Connect" prompt is the actual signal we act on and
        // the outputView "Successfully installed" check further down is the
        // ground truth — so a miss here is safe to log and move on.
        try {
            await waitForNotification("The following environment is selected");
        } catch (e) {
            console.log(
                "'The following environment is selected' notification not " +
                    "observed; continuing on the 'Databricks Connect' prompt.",
                e
            );
        }
        await waitForNotification("Databricks Connect", "Install");

        await browser.waitUntil(
            async () => {
                const workbench = await browser.getWorkbench();
                const view = await workbench.getBottomBar().openOutputView();
                const outputText = (await view.getText()).join("");
                console.log("Output view text: ", outputText);
                return (
                    outputText.includes("Successfully installed") ||
                    outputText.includes("finished with status 'done'")
                );
            },
            {
                // Creating a fresh venv and installing databricks-connect from
                // the requirements set is measurably slower on the Windows
                // shard than on Linux — 60s is not always enough. 180s covers
                // observed Windows install times comfortably.
                timeout: 180_000,
                interval: 2000,
                timeoutMsg:
                    "Installation output did not contain 'Successfully installed'",
            }
        );

        // On windows we don't always get a notification after installation (TODO: fix it in the extension code),
        // so we need to refresh manually.
        await executeCommandWhenAvailable(
            "Databricks: Refresh python environment status"
        );

        await browser.waitUntil(
            async () => {
                const subTreeItems = await getTreeViewItems(
                    "CONFIGURATION",
                    "Python Environment"
                );
                for (const item of subTreeItems) {
                    const label = await item.getLabel();
                    console.log("Python Environment item label: ", label);
                    if (label.includes("Databricks Connect:")) {
                        return true;
                    }
                }
                return false;
            },
            {
                timeout: 60_000,
                interval: 2000,
                timeoutMsg: "Setup confirmation failed",
            }
        );
    });

    it("should run a python file with dbconnect", async () => {
        await openFile("hello.py");
        await executeCommandWhenAvailable(
            "Databricks: Run current file with Databricks Connect"
        );
        const output = path.join(projectDir, "file-output.json");
        // This is the first execution against serverless DBConnect (mocha runs
        // the `it` blocks in source order), so it pays the cold session/compute
        // spin-up cost — give it the same larger budget as the notebook first
        // cells below.
        await checkOutputFile(output, "hello world", 180_000);
    });

    it("should run a notebook with dbconnect", async () => {
        await openFile("notebook.ipynb");
        await executeCommandWhenAvailable("Notebook: Run All");

        // The two-step kernel quick-pick ("Python Environments..." -> ".venv")
        // is a known-flaky UI interaction: the picker occasionally isn't ready
        // when we act on it, or the first selection doesn't register. Retry the
        // whole chain a couple of times before giving up.
        await browser.waitUntil(
            async () => {
                try {
                    const kernelInput = await waitForInput();
                    await kernelInput.selectQuickPick("Python Environments...");
                    console.log("Selected 'Python Environments...' option");

                    const envInput = await waitForInput();
                    await envInput.selectQuickPick(".venv");
                    console.log("Selected .venv environment");
                    return true;
                } catch (e) {
                    console.log(
                        "Kernel selection attempt failed, retrying:",
                        e
                    );
                    return false;
                }
            },
            {
                timeout: 60_000,
                interval: 2000,
                timeoutMsg:
                    "Failed to select the .venv kernel for the notebook",
            }
        );

        const firstCellOutput = path.join(
            projectDir,
            "nested",
            "notebook-output.json"
        );
        // The first cell triggers a cold serverless DBConnect session plus a
        // kernel bind, which is measurably slower on the Windows shard — give
        // it a larger budget. Once the session is warm the second cell uses the
        // default timeout.
        await checkOutputFile(firstCellOutput, "hello world", 180_000);

        const secondCellOutput = path.join(
            projectDir,
            "nested",
            "file-output.json"
        );
        await checkOutputFile(secondCellOutput, "hello world");
    });

    it("should run a databricks notebook with dbconnect and handle magic comments", async () => {
        await openFile("databricks-notebook.py");
        await executeCommandWhenAvailable("Jupyter: Run All Cells");

        const sqlOutputFile = path.join(
            projectDir,
            "nested",
            "databricks-notebook-output.json"
        );
        // First cell of this notebook — same cold-start cost as above, so give
        // it the larger budget too.
        await checkOutputFile(sqlOutputFile, "hello; world", 180_000);

        const runOutputFile = path.join(
            projectDir,
            "nested",
            "databricks-run-notebook-output.json"
        );
        await checkOutputFile(runOutputFile, "hello run;");
    });
});
