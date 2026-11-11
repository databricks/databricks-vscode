import assert from "node:assert";
import { getBasicBundleConfig, writeRootBundleConfig } from "./utils/bundle-fixtures.ts";
import { waitForLogin } from "./utils/configuration.ts";
import { dismissNotifications } from "./utils/dismiss-notifications.ts";
import type { CustomTreeSection } from "wdio-vscode-service";
import { getViewSection } from "./utils/view.ts";

/**
 * The same journey in two windows (wdio.mock.conf.ts), behind the mock's
 * intercepting proxy, whose certificate is in no store, even where run-e2e.sh
 * makes the OS store trust the mock's own:
 *
 * - "untrusted": NODE_EXTRA_CA_CERTS unset, `http.systemCertificates` off, and
 *   `http.proxyStrictSSL: false`. Requests must go through anyway, as 2.22.0's
 *   do.
 * - "trusted": the proxy's certificate only through NODE_EXTRA_CA_CERTS, with
 *   `http.systemCertificates` at its default (on). Requests must trust it.
 *
 * Both sign in, list the workspace's clusters, and stream a Unity Gateway
 * reply. Through fetch rather than node:https, both fail the requests with a
 * certificate error.
 */
const CLUSTER = "e2e shared cluster";
const REPLY = "Hello from the mock gateway.";

describe("Requests through a proxy whose certificate is or isn't trusted", async function () {
    this.timeout(3 * 60 * 1000);

    before(async function () {
        assert(process.env.WORKSPACE_PATH, "WORKSPACE_PATH doesn't exist");
        await writeRootBundleConfig(getBasicBundleConfig(), process.env.WORKSPACE_PATH);
    });

    it("should open VS Code and dismiss notifications", async () => {
        await dismissNotifications();
    });

    it("should run in the window its trust asks for", async () => {
        // Read in the extension host, where the requests are made: what each window's CA variables and settings are.
        const state = await browser.executeWorkbench((vscode) => ({
            proxy: vscode.workspace.getConfiguration("http").get("proxy") as string | undefined,
            strictSSL: vscode.workspace.getConfiguration("http").get("proxyStrictSSL") as
                | boolean
                | undefined,
            systemCertificates: vscode.workspace
                .getConfiguration("http")
                .get("systemCertificates") as boolean | undefined,
            nodeExtraCaCerts: process.env.NODE_EXTRA_CA_CERTS?.split(/[\\/]/).pop() ?? null,
            sslCertFile: process.env.SSL_CERT_FILE !== undefined,
        }));
        console.log(`TRUST-WINDOW ${JSON.stringify(state)}`);
        // Both through the intercepting proxy, whose certificate no store holds.
        assert.strictEqual(
            state.proxy,
            `http://127.0.0.1:${process.env.MOCK_INTERCEPT_PORT ?? "8889"}`,
        );
        if (state.strictSSL === false) {
            // Untrusted: no CA reaches VS Code through a variable, and the OS store is off.
            assert.strictEqual(state.systemCertificates, false);
            assert.deepStrictEqual(
                { nodeExtraCaCerts: state.nodeExtraCaCerts, sslCertFile: state.sslCertFile },
                { nodeExtraCaCerts: null, sslCertFile: false },
            );
        } else {
            // Trusted: the proxy's certificate only through NODE_EXTRA_CA_CERTS, with the OS store on.
            assert.deepStrictEqual(
                { nodeExtraCaCerts: state.nodeExtraCaCerts, sslCertFile: state.sslCertFile },
                { nodeExtraCaCerts: "intercept-cert.pem", sslCertFile: false },
            );
            assert.notStrictEqual(state.systemCertificates, false);
        }
    });

    it("should sign in through the proxy", async () => {
        await waitForLogin("DEFAULT");
    });

    it("should list the workspace's clusters", async () => {
        // The Compute view is behind the views.cluster experiment, as compute_lifecycle opts into it.
        await browser.executeWorkbench(async (vscode) => {
            await vscode.workspace
                .getConfiguration("databricks")
                .update(
                    "experiments.optInto",
                    ["views.cluster"],
                    vscode.ConfigurationTarget.Workspace,
                );
        });
        const section = (await getViewSection("COMPUTE")) as CustomTreeSection;
        await browser.waitUntil(
            async () => {
                for (const item of await section.getVisibleItems()) {
                    if ((await item.getLabel()) === CLUSTER) {
                        return true;
                    }
                }
                return false;
            },
            {
                timeout: 60_000,
                interval: 1_000,
                timeoutMsg: `The Compute view doesn't list "${CLUSTER}"`,
            },
        );
    });

    it("should stream a reply from Unity Gateway", async () => {
        const reply = await browser.executeWorkbench(async (vscode) => {
            // The chat models are listed once the Unity Gateway sign-in connects, which takes a moment.
            const deadline = Date.now() + 60_000;
            let models = await vscode.lm.selectChatModels({ vendor: "databricks" });
            while (models.length === 0 && Date.now() < deadline) {
                await new Promise((resolve) => setTimeout(resolve, 1_000));
                models = await vscode.lm.selectChatModels({ vendor: "databricks" });
            }
            const [model] = models;
            if (model === undefined) {
                throw new Error("Unity Gateway lists no chat model");
            }
            const cancellation = new vscode.CancellationTokenSource();
            const response = await model.sendRequest(
                [vscode.LanguageModelChatMessage.User("Say hello")],
                {},
                cancellation.token,
            );
            let text = "";
            for await (const fragment of response.text) {
                text += fragment;
            }
            return text;
        });
        assert.strictEqual(reply, REPLY);
    });
});
