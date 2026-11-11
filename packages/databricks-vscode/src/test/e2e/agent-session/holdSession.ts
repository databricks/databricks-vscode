/* eslint-disable no-console */
import path from "node:path";
import fs from "node:fs/promises";
import {existsSync, mkdirSync} from "node:fs";
import {sleep} from "wdio-vscode-service";

/**
 * Not a test: keeps one VS Code session open for an MCP client to attach to,
 * and relays `agent:session exec` requests to the VS Code API. The protocol is
 * files under AGENT_SESSION_DIR so nothing listens on a socket:
 *
 * - `session.json`, written once the workbench is ready, holds what
 *   `attach_session` needs.
 * - `requests/<id>.json` is `{fn, args}`; `fn` is source evaluating to a
 *   function of `(vscode, ...args)`. The reply lands in `responses/<id>.json`.
 * - `stop` ends the session.
 */

const SESSION_DIR = process.env.AGENT_SESSION_DIR!;
const REQUESTS = path.join(SESSION_DIR, "requests");
const RESPONSES = path.join(SESSION_DIR, "responses");
const STOP_FILE = path.join(SESSION_DIR, "stop");
const POLL_MS = 250;
const LIVENESS_EVERY_MS = 5000;

async function writeJsonAtomic(file: string, value: unknown) {
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value, null, 2), {mode: 0o600});
    await fs.rename(tmp, file);
}

async function serveRequests() {
    const names = (await fs.readdir(REQUESTS)).filter((name) =>
        name.endsWith(".json")
    );
    for (const name of names) {
        const file = path.join(REQUESTS, name);
        let reply: {ok: boolean; result?: unknown; error?: string};
        try {
            const {fn, args} = JSON.parse(await fs.readFile(file, "utf-8"));
            const result = await browser.executeWorkbench(fn, ...(args ?? []));
            reply = {ok: true, result};
        } catch (e) {
            reply = {ok: false, error: e instanceof Error ? e.message : `${e}`};
        }
        await fs.rm(file, {force: true});
        await writeJsonAtomic(path.join(RESPONSES, name), reply);
    }
}

describe("agent session", () => {
    it("holds VS Code open until stopped", async () => {
        mkdirSync(REQUESTS, {recursive: true});
        mkdirSync(RESPONSES, {recursive: true});

        const workbench = await browser.getWorkbench();
        await workbench.wait();

        const {hostname, port, path: driverPath, protocol} = browser.options;
        const attach = {
            sessionId: browser.sessionId,
            name: "vscode",
            provider: "external",
            platform: "browser",
            browser: "chrome",
            webdriverConfig: {
                protocol: protocol ?? "http",
                hostname: hostname ?? "localhost",
                port,
                path: driverPath ?? "/",
            },
        };
        await writeJsonAtomic(path.join(SESSION_DIR, "session.json"), {
            attach,
            vscodeVersion: await browser.getVSCodeVersion(),
            workspacePath: process.env.AGENT_SESSION_WORKSPACE,
            mode: process.env.AGENT_SESSION_MODE,
            workerPid: process.pid,
            readyAt: new Date().toISOString(),
        });
        console.log(`Agent session ready: ${JSON.stringify(attach)}`);

        let lastLiveness = Date.now();
        while (!existsSync(STOP_FILE)) {
            await serveRequests();
            if (Date.now() - lastLiveness > LIVENESS_EVERY_MS) {
                // Throws once the window is gone, which ends the session.
                await browser.getTitle();
                lastLiveness = Date.now();
            }
            await sleep(POLL_MS);
        }
        console.log("Stop requested");
    });
});
