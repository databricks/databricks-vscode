import path from "node:path";
import * as fs from "fs/promises";
import assert from "node:assert";
import {execFile as execFileCb} from "node:child_process";
import {promisify} from "node:util";
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

const execFile = promisify(execFileCb);

// Absolute path to the Python interpreter inside the project's `.venv`.
function venvPython(projectDir: string): string {
    return process.platform === "win32"
        ? path.join(projectDir, ".venv", "Scripts", "python.exe")
        : path.join(projectDir, ".venv", "bin", "python");
}

// Packages the Jupyter extension needs in the selected environment before it
// will start a kernel. When starting a kernel it probes the interpreter with
// `python -c "import jupyter"` / `import notebook`, and if either import fails
// it refuses to start with "requires the jupyter and notebook package"
// (`ipykernel` is needed by the kernel itself). Confirmed on a real Windows VM:
// installing all three lets the kernel start.
const KERNEL_DEPS = ["ipykernel", "jupyter", "notebook"];

// Guarantees the project's `.venv` has the packages the notebook kernel needs
// to start. The "Setup python environment" flow is supposed to install them
// from requirements.txt, but on the Windows shard the Python extension's
// "select dependencies" quick-pick does not reliably register, so `.venv` ends
// up without them. When that happens the kernel fails to start ("requires the
// jupyter and notebook package") and — in test mode — the extension's
// auto-install prompt is suppressed ("DialogService: refused to show dialog in
// tests"), so the notebook cell never runs and no output file is written. We
// install the deps directly to remove that dependency on the flaky UI step; the
// pip call is idempotent, so on shards that already have them it is a fast
// no-op.
async function ensureVenvHasKernelDeps(projectDir: string) {
    const python = venvPython(projectDir);
    try {
        await fs.access(python);
    } catch {
        console.log(
            `venv python not found at "${python}"; skipping kernel-deps check`
        );
        return;
    }
    try {
        const {stdout, stderr} = await execFile(python, [
            "-m",
            "pip",
            "install",
            ...KERNEL_DEPS,
            "--disable-pip-version-check",
        ]);
        console.log("ensureVenvHasKernelDeps stdout:", stdout);
        if (stderr) {
            console.log("ensureVenvHasKernelDeps stderr:", stderr);
        }
    } catch (e) {
        console.log("Failed to install kernel deps into .venv:", e);
    }
}

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

// Dumps every open notebook document's cell outputs straight from the VS Code
// API. This is the ground truth for "did the cell error out?": a cell that
// raised shows up here as an `error` output item with the name/message/stack,
// and a cell that never ran has an empty `executionOrder`. We read it via
// `executeWorkbench` (runs inside the extension host with the full `vscode`
// API) so it does not depend on any DOM selector — unlike the Output-channel
// scrape below, whose `select[title="Tasks"]` locator is stale on current
// VS Code and silently returns nothing.
//
// We iterate `workspace.notebookDocuments` rather than just
// `window.activeNotebookEditor` because the Databricks `.py` "notebook"
// (`# Databricks notebook source` + `# MAGIC %sql`) runs in an Interactive
// Window whose document is NOT the active notebook editor — the focused editor
// is the plain `.py` text editor, so the active-editor-only view reports "no
// notebook" and misses exactly the failing cell we need to see.
async function dumpOpenNotebookCells() {
    try {
        // NB: everything here must stay inline arrow functions. This callback is
        // serialized and run in the extension host, so a named nested function
        // (e.g. `const formatCell = () => …`) gets an esbuild `__name(...)`
        // wrapper that is undefined there and throws "__name is not defined".
        const cells = await browser.executeWorkbench((vscode) => {
            const docs = vscode.workspace.notebookDocuments ?? [];
            if (docs.length === 0) {
                return "<no open notebook documents>";
            }
            return docs
                .map((doc: any) => {
                    const header = `notebook "${doc.uri?.toString()}" (${
                        doc.notebookType
                    }), ${doc.cellCount} cell(s)`;
                    const cellLines = doc.getCells().map((cell: any) => {
                        const outputs = (cell.outputs ?? []).flatMap((o: any) =>
                            (o.items ?? []).map(
                                (item: any) =>
                                    `    [${item.mime}] ${Buffer.from(
                                        item.data
                                    ).toString("utf8")}`
                            )
                        );
                        return [
                            `  cell #${cell.index} (${
                                cell.kind === 2 ? "code" : "markup"
                            }), ` +
                                `executionOrder=${
                                    cell.executionSummary?.executionOrder ??
                                    "<not run>"
                                }, ` +
                                `success=${
                                    cell.executionSummary?.success ?? "<n/a>"
                                }`,
                            ...outputs,
                        ].join("\n");
                    });
                    return [header, ...cellLines].join("\n");
                })
                .join("\n\n");
        });
        console.log(
            "=== open notebook documents (via VS Code API) ===\n",
            cells
        );
    } catch (e) {
        console.log("could not read open notebook documents:", e);
    }
}

// Dumps VS Code's on-disk logs (extension host + every Output-channel log the
// window has written). The Jupyter/DBConnect kernel error lands in one of these
// files even when the in-UI Output panel can't be scraped, so this is a
// selector-independent way to capture it.
async function dumpVscodeLogFiles() {
    let logsRoot: string | undefined;
    try {
        logsRoot = await browser.executeWorkbench(
            (vscode) => vscode.env.logUri?.fsPath
        );
    } catch (e) {
        console.log("could not resolve VS Code logs directory:", e);
        return;
    }
    if (!logsRoot) {
        console.log("VS Code logs directory unavailable");
        return;
    }
    let logFiles: string[];
    try {
        logFiles = (await listFilesRecursive(logsRoot)).filter((f) =>
            f.endsWith(".log")
        );
    } catch (e) {
        console.log(`could not list logs under "${logsRoot}":`, e);
        return;
    }
    console.log(`=== VS Code log files under "${logsRoot}" ===`, logFiles);
    for (const rel of logFiles) {
        try {
            const text = await fs.readFile(path.join(logsRoot, rel), "utf-8");
            if (text.trim().length > 0) {
                console.log(`=== log "${rel}" ===\n${text}`);
            }
        } catch (e) {
            console.log(`could not read log "${rel}":`, e);
        }
    }
}

// Dumps whatever we can observe about the notebook run when an output file
// never shows up (or never gets the expected content). Runs only on failure,
// so the extra work never slows down the happy path.
//
// It answers the two questions a missing output file raises: (1) did the cell
// write the file somewhere else? — we list the whole workspace tree, since a
// cwd mismatch would drop it in the project root rather than `nested/`; and
// (2) did the cell error out (or never run)? — we read the notebook's cell
// outputs and execution summaries via the VS Code API, and dump the on-disk
// log files. Both are selector-independent. The Output-channel scrape is kept
// last as best-effort, since its locator is stale on current VS Code.
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

    // Cell outputs + execution summaries for every open notebook document via
    // the VS Code API (the reliable source for a cell error/traceback or a
    // never-run cell, including the Interactive Window used by the `.py`
    // Databricks notebook).
    await dumpOpenNotebookCells();

    // On-disk VS Code logs (extension host + Output-channel logs), which
    // capture the kernel/DBConnect error even when the panel can't be scraped.
    await dumpVscodeLogFiles();

    // Best-effort Output-channel scrape. Kept for completeness, but its
    // `select[title="Tasks"]` locator is stale on current VS Code and often
    // returns nothing — so a failure here is logged and ignored, never fatal to
    // the rest of the dump.
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

// Polls up to `timeout` for `filePath` to exist and contain `expectedContent`,
// returning true on success and false on timeout — it never throws for a
// missing file. A missing file is a normal "not ready yet" (the notebook writes
// it asynchronously); on the Windows shard a concurrent writer / antivirus scan
// can also briefly share-lock it (EPERM/EBUSY/EACCES) right after creation. Both
// are treated as poll-misses so the caller decides what a timeout means.
async function pollForOutput(
    filePath: string,
    expectedContent: string,
    timeout: number
): Promise<boolean> {
    try {
        await browser.waitUntil(
            async () => {
                let fileContent: string;
                try {
                    fileContent = await fs.readFile(filePath, "utf-8");
                } catch {
                    return false;
                }
                console.log(`"${filePath}" contents: `, fileContent);
                return fileContent.includes(expectedContent);
            },
            {timeout, interval: 2000}
        );
        return true;
    } catch {
        return false;
    }
}

// Asserts `filePath` exists and contains `expectedContent` within `timeout`. On
// timeout it dumps diagnostics and throws with a readable message (never a raw
// ENOENT stack), then removes the file so a later assertion on the same path
// starts clean.
async function checkOutputFile(
    filePath: string,
    expectedContent: string,
    timeout = 120_000
) {
    const found = await pollForOutput(filePath, expectedContent, timeout);
    if (!found) {
        await dumpNotebookDiagnostics(filePath, expectedContent, undefined);
        throw new Error(
            `Output file "${filePath}" did not contain ` +
                `"${expectedContent}" within ${timeout}ms`
        );
    }
    await fs.rm(filePath);
}

// Executes exactly ONE code cell of an open notebook by index, via the VS Code
// CORE command `notebook.cell.execute`, then waits until that cell reaches a
// TERMINAL executionSummary (executionOrder assigned AND success is a boolean).
//
// Driving cells one-by-one bypasses "Run All"'s cell-to-cell chaining, which is
// orchestrated entirely by VS Code core + the Jupyter extension (this extension
// registers no NotebookController) and intermittently stalls after the first
// serverless-DBConnect cell in the headless CI renderer, stranding later cells
// at `<not run>`. Executing + gating per cell removes that dependency.
//
// Fails CLOSED: a cell that never starts trips the waitUntil timeout with a
// precise message; a cell that runs but raises trips the success assertion.
async function runNotebookCellAndWait(
    notebookUri: string,
    cellIndex: number,
    timeout = 180_000
) {
    await browser.executeWorkbench(
        async (vscode, uriStr, idx) => {
            const uri = vscode.Uri.parse(uriStr);
            await vscode.commands.executeCommand("notebook.cell.execute", {
                ranges: [{start: idx, end: idx + 1}],
                document: uri,
            });
        },
        notebookUri,
        cellIndex
    );

    let last = "<none>";
    await browser.waitUntil(
        async () => {
            const state = await browser.executeWorkbench(
                (vscode, uriStr, idx) => {
                    const doc = (vscode.workspace.notebookDocuments ?? []).find(
                        (d: any) => d.uri.toString() === uriStr
                    );
                    if (!doc) {
                        return {found: false, order: null, success: null};
                    }
                    const s = doc.getCells()[idx]?.executionSummary;
                    return {
                        found: true,
                        order: s?.executionOrder ?? null,
                        success: s?.success ?? null,
                    };
                },
                notebookUri,
                cellIndex
            );
            last = JSON.stringify(state);
            // Terminal == executionOrder assigned AND success is a boolean.
            return (
                state.found && state.order !== null && state.success !== null
            );
        },
        {
            timeout,
            interval: 1000,
            timeoutMsg: `notebook cell #${cellIndex} never reached a terminal execution state (last=${last})`,
        }
    );

    const ok = await browser.executeWorkbench(
        (vscode, uriStr, idx) =>
            (vscode.workspace.notebookDocuments ?? [])
                .find((d: any) => d.uri.toString() === uriStr)
                ?.getCells()[idx]?.executionSummary?.success ?? null,
        notebookUri,
        cellIndex
    );
    assert.strictEqual(
        ok,
        true,
        `notebook cell #${cellIndex} executed but FAILED (success=false)`
    );
}

// Fail-closed gate for the append-only Interactive Window used by the Databricks
// `.py` notebook. Unlike a real `.ipynb`, the Interactive Window has no per-cell
// re-execute command, so we still trigger it via "Jupyter: Run All Cells" and
// gate here. Scopes to the interactive-window document (uri scheme
// `vscode-interactive`) so a stale `.ipynb` left open by an earlier test cannot
// satisfy the count. Waits until at least `minCodeCells` code cells reach a
// terminal executionSummary and asserts none failed — promoting the old
// best-effort log into a HARD, deterministic failure if Run All stalls after the
// first Spark cell, instead of a silent 180s output-file timeout.
async function waitForInteractiveCellsTerminal(
    minCodeCells: number,
    timeout = 180_000
) {
    let last = "<none>";
    await browser.waitUntil(
        async () => {
            const r = await browser.executeWorkbench((vscode, min) => {
                let terminal = 0;
                let failed = 0;
                let total = 0;
                const lines: string[] = [];
                for (const doc of vscode.workspace.notebookDocuments ?? []) {
                    // Interactive Window docs use the vscode-interactive scheme.
                    if (doc.uri.scheme !== "vscode-interactive") {
                        continue;
                    }
                    for (const cell of doc.getCells()) {
                        if (cell.kind !== 2) {
                            continue; // code cells only
                        }
                        total += 1;
                        const s = cell.executionSummary;
                        const isTerminal =
                            s?.executionOrder !== undefined &&
                            s?.success !== undefined;
                        if (isTerminal) {
                            terminal += 1;
                            if (s?.success === false) {
                                failed += 1;
                            }
                        }
                        lines.push(
                            `#${cell.index} order=${
                                s?.executionOrder ?? "-"
                            } success=${s?.success ?? "-"}`
                        );
                    }
                }
                return {
                    terminal,
                    failed,
                    total,
                    reachedMin: terminal >= min,
                    summary: lines.join("; "),
                };
            }, minCodeCells);
            last = JSON.stringify(r);
            // A cell that ran and raised must fail immediately, not time out.
            assert.strictEqual(
                r.failed,
                0,
                `an interactive-window cell FAILED: ${r.summary}`
            );
            return r.reachedMin;
        },
        {
            timeout,
            interval: 2000,
            timeoutMsg: `Interactive Window did not advance through all cells within ${timeout}ms (need ${minCodeCells} terminal code cells); last=${last}`,
        }
    );
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

        // Windows venv creation + dependency install is dramatically slower
        // than Linux, and the "environment is selected" / "Databricks Connect"
        // prompt toasts can expire a fixed notification wait before they ever
        // fire. Gate on the filesystem ground truth — the venv interpreter
        // existing — with a generous budget instead of racing a transient toast.
        const python = venvPython(projectDir);
        await browser.waitUntil(
            async () => {
                try {
                    await fs.access(python);
                    return true;
                } catch {
                    return false;
                }
            },
            {
                timeout: 240_000,
                interval: 2000,
                timeoutMsg: `venv interpreter was not created at "${python}"`,
            }
        );

        // The "The following environment is selected" notification is only an
        // ordering hint; the outputView "Successfully installed" check further
        // down is the ground truth, so a miss here is safe to log and move on.
        try {
            await waitForNotification("The following environment is selected");
        } catch (e) {
            console.log(
                "'The following environment is selected' notification not " +
                    "observed; continuing on the 'Databricks Connect' prompt.",
                e
            );
        }

        // Prefer clicking the "Databricks Connect / Install" prompt when it
        // shows, but don't fail if the transient toast never surfaces on the
        // slow Windows shard — drive the install deterministically via the
        // command instead. The venv exists (asserted above), so the reinstall
        // command has an interpreter to work with.
        try {
            await waitForNotification("Databricks Connect", "Install", 30_000);
        } catch (e) {
            console.log(
                "'Databricks Connect' install prompt not observed; triggering " +
                    "the reinstall command instead.",
                e
            );
            await executeCommandWhenAvailable(
                "Databricks: Reinstall Databricks Connect"
            );
            // The reinstall command may itself prompt for confirmation.
            try {
                const confirmInput = await waitForInput();
                await confirmInput.confirm();
            } catch (e) {
                console.log(
                    "No confirmation prompt for reinstall; continuing.",
                    e
                );
            }
        }

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

        // The notebook tests below need a startable Jupyter kernel in .venv.
        // Guarantee the kernel deps (ipykernel + jupyter + notebook) are present
        // rather than trusting the dependency quick-pick, which is unreliable on
        // the Windows shard.
        await ensureVenvHasKernelDeps(projectDir);
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

        const nbUri = await browser.executeWorkbench(
            (vscode) =>
                vscode.window.activeNotebookEditor?.notebook.uri.toString()
        );
        assert(nbUri, "notebook.ipynb did not open as a NotebookDocument");

        // Issue Run All once purely to surface the kernel quick-pick; we then
        // drive cells individually below, so whether Run All chains or not is
        // irrelevant.
        await executeCommandWhenAvailable("Notebook: Run All");

        // The two-step kernel quick-pick ("Python Environments..." -> ".venv")
        // is a known-flaky UI interaction: the picker occasionally isn't ready
        // when we act on it, or the first selection doesn't register. Retry the
        // chain before giving up.
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

        // Drive each cell explicitly and wait for it to reach a terminal state,
        // rather than trusting Run All to chain from cell #0 to cell #1 (the
        // headless renderer intermittently stalls that advance). Cell #0 runs a
        // DBConnect query -> notebook-output.json; it pays the cold serverless
        // session/kernel-bind cost, so give it the larger budget.
        await runNotebookCellAndWait(nbUri, 0, 180_000);
        const firstCellOutput = path.join(
            projectDir,
            "nested",
            "notebook-output.json"
        );
        await checkOutputFile(firstCellOutput, "hello world", 180_000);

        // Cell #1 exercises the %run MAGIC path (`%run "./hello.py"`) ->
        // file-output.json. Session is warm now, so the default budget suffices.
        await runNotebookCellAndWait(nbUri, 1, 120_000);
        const secondCellOutput = path.join(
            projectDir,
            "nested",
            "file-output.json"
        );
        await checkOutputFile(secondCellOutput, "hello world");
    });

    // Exercises the Databricks SQL magic (`%sql` -> `_sqldf`) and the `%run`
    // magic. The Databricks `.py` notebook runs in an append-only Interactive
    // Window, which has no per-cell re-execute command, so we trigger it via
    // "Jupyter: Run All Cells" and hard-gate on all cells reaching a terminal
    // state before checking outputs.
    it("should run a databricks notebook with dbconnect and handle magic comments", async () => {
        await openFile("databricks-notebook.py");
        await executeCommandWhenAvailable("Jupyter: Run All Cells");

        // databricks-notebook.py has 4 executable regions: spark.sql().show(),
        // the %sql magic, _sqldf.toPandas(), and %run. Fail closed if Run All
        // stalls after the first Spark cell (a headless-renderer chaining issue)
        // — a deterministic "N/M cells never ran" failure instead of a silent
        // output-file timeout. Larger budget covers the cold serverless start.
        await waitForInteractiveCellsTerminal(4, 240_000);

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
