import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { registerFeatures } from "../../kernel/feature";
import { fakeFeatureHost, fakeKernel } from "../../test-support/fakes";
import { SERVERLESS_SESSION, SESSION_REMOTE_NAME } from "../../test-support/sessionEnv";
import { env, host as vscode } from "../../test-support/vscode";
import { logs, OPEN_LOG_FOLDER } from "./index";

describe("the logs feature (INFRA-04)", () => {
    beforeEach(() => vscode.reset());

    it("opens the folder with the JSON log files", async () => {
        const kernel = fakeKernel();
        registerFeatures([logs], fakeFeatureHost(kernel).host);
        await vscode.commands.get(OPEN_LOG_FOLDER)!();
        expect(vscode.opened).toEqual(["file:///tmp/databricks-vscode-test-logs"]);
    });

    it("opens the JSON log file in an editor in a remote window, a session window's included", async () => {
        env.remoteName = SESSION_REMOTE_NAME;
        try {
            const kernel = fakeKernel({ host: SERVERLESS_SESSION });
            registerFeatures([logs], fakeFeatureHost(kernel).host);
            await vscode.commands.get(OPEN_LOG_FOLDER)!();
            expect(vscode.opened).toEqual([]);
            expect(vscode.shownDocuments).toEqual([
                path.join("/tmp/databricks-vscode-test-logs", "sdk-and-extension-logs.json"),
            ]);
        } finally {
            env.remoteName = undefined;
        }
    });
});
