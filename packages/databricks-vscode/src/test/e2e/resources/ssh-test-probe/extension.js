const vscode = require("vscode");
const fs = require("node:fs/promises");
const {randomBytes, randomUUID, createHash} = require("node:crypto");

// A remote call that never settles would hang this probe past every wait the
// spec has, leaving the remote window and tunnel open with nothing left to close
// them. Bound each one so a stuck call still reaches the report and closeWindow
// below. Generous: a healthy 8 MiB round trip takes seconds.
const OP_TIMEOUT_MS = 60_000;

async function withTimeout(operation, label) {
    const seconds = OP_TIMEOUT_MS / 1000;
    let timer;
    const expiry = new Promise((resolve, reject) => {
        timer = setTimeout(() => {
            reject(new Error(`${label} did not finish within ${seconds}s`));
        }, OP_TIMEOUT_MS);
    });
    try {
        return await Promise.race([operation, expiry]);
    } finally {
        clearTimeout(timer);
    }
}

// UI placement keeps node:fs local; workspace.fs crosses the real SSH connection.
exports.activate = async function () {
    const resultPath = process.env.TEST_SSH_RESULT_PATH;
    if (!resultPath || vscode.env.remoteName !== "ssh-remote") {
        return;
    }
    const report = async (result) => {
        await fs.writeFile(`${resultPath}.tmp`, JSON.stringify(result));
        await fs.rename(`${resultPath}.tmp`, resultPath);
    };
    let folder = vscode.workspace.workspaceFolders?.[0];
    const deadline = Date.now() + 60_000;
    while (
        (!folder || folder.uri.scheme !== "vscode-remote") &&
        Date.now() < deadline
    ) {
        await report({
            phase: "waiting-for-folder",
            folders: vscode.workspace.workspaceFolders?.map((f) =>
                f.uri.toString()
            ),
        });
        await new Promise((resolve) => setTimeout(resolve, 1000));
        folder = vscode.workspace.workspaceFolders?.[0];
    }
    if (!folder || folder.uri.scheme !== "vscode-remote") {
        await report({
            error: `SSH window has no remote workspace folder: ${JSON.stringify(
                vscode.workspace.workspaceFolders?.map((f) => f.uri.toString())
            )}`,
        });
        await vscode.commands.executeCommand("workbench.action.closeWindow");
        return;
    }
    const file = folder.uri.with({
        path: `/tmp/vscode-ssh-test-${randomUUID()}`,
    });
    const textFile = file.with({path: `${file.path}.txt`});
    const editorText = `Remote SSH editor check ${randomUUID()}`;
    const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
    const payload = randomBytes(8 * 1024 * 1024);
    const expectedHash = hash(payload);
    let failure;
    try {
        await report({phase: "connected", authority: folder.uri.authority});
        for (let round = 0; round < 3; round++) {
            await withTimeout(
                vscode.workspace.fs.writeFile(file, payload),
                `Remote write ${round + 1}`
            );
            const returned = await withTimeout(
                vscode.workspace.fs.readFile(file),
                `Remote read ${round + 1}`
            );
            if (
                returned.length !== payload.length ||
                hash(returned) !== expectedHash
            ) {
                throw new Error(
                    `Remote transfer ${round + 1} was truncated or corrupted`
                );
            }
            await report({phase: "transferring", completedRounds: round + 1});
            if (round < 2) {
                await new Promise((resolve) => setTimeout(resolve, 15_000));
            }
        }
        await withTimeout(
            vscode.workspace.fs.writeFile(textFile, Buffer.from(editorText)),
            "Remote write of the editor file"
        );
        await withTimeout(
            vscode.commands.executeCommand("revealInExplorer", textFile),
            "revealInExplorer"
        );
        await report({
            phase: "ui-ready",
            fileName: textFile.path.split("/").pop(),
            editorText,
            authority: folder.uri.authority,
        });
        const uiDeadline = Date.now() + 120_000;
        while (true) {
            try {
                const outcome = await fs.readFile(
                    `${resultPath}.ui-complete`,
                    "utf8"
                );
                if (outcome !== "passed") {
                    throw new Error("Remote Explorer/editor UI check failed");
                }
                break;
            } catch (error) {
                if (error.code !== "ENOENT") {
                    throw error;
                }
                if (Date.now() >= uiDeadline) {
                    throw new Error(
                        "Remote Explorer/editor UI check timed out"
                    );
                }
                await new Promise((resolve) => setTimeout(resolve, 250));
            }
        }
    } catch (error) {
        failure = String(error);
    } finally {
        try {
            await withTimeout(
                vscode.workspace.fs.delete(file),
                "Remote delete of the payload file"
            );
            try {
                await withTimeout(
                    vscode.workspace.fs.delete(textFile),
                    "Remote delete of the editor file"
                );
            } catch (error) {
                if (error.code !== "FileNotFound") {
                    throw error;
                }
            }
        } catch (error) {
            failure ??= `Remote file cleanup failed: ${error}`;
        }
    }
    await report(
        failure
            ? {error: failure}
            : {
                  phase: "passed",
                  bytesPerRound: payload.length,
                  completedRounds: 3,
                  authority: folder.uri.authority,
              }
    );
    await vscode.commands.executeCommand("workbench.action.closeWindow");
};
