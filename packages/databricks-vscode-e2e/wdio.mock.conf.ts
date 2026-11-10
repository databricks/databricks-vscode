// The default config, pointed at the mock workspace (mock/README.md): VS Code and
// the specs' own calls go through the mock's proxy. MOCK_FOLDER_ONLY=1 drops
// the window without a folder (wdio.conf.ts).
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { config as base } from "./wdio.conf.ts";

// run-e2e.sh's MOCK_PROXY_PORT, for a run beside another.
const proxy = `http://127.0.0.1:${process.env.MOCK_PROXY_PORT ?? "8888"}`;
// The mock's intercepting proxy, which the trust windows go through: its certificate is in no store, so what a
// window trusts is only what it's given here, whatever run-e2e.sh made the OS store trust.
const interceptingProxy = `http://127.0.0.1:${process.env.MOCK_INTERCEPT_PORT ?? "8889"}`;
const INTERCEPT_CA = path.join(
    process.env.MOCK_DIR ?? "/tmp/databricks-vscode-e2e-mock",
    "intercept-cert.pem",
);

// The proxy-TLS journey (proxy_tls.trust.e2e.ts), in two windows that trust the mock's CA in different ways.
const TRUST_SPEC = "./src/proxy_tls.trust.e2e.ts";
// Every other spec: `--spec` runs a spec in each window that doesn't exclude it, so the trust
// windows exclude these, or they'd run, say, the serverless spec with the wrong profile.
const OTHER_SPECS = fs
    .globSync("src/**/*.e2e.ts")
    .map((f) => `./${f.split("\\").join("/")}`)
    .filter((f) => f !== TRUST_SPEC);
// Each trust window's CA variables, in place of run-e2e.sh's, which name the mock's own certificate. VS Code reads
// them at start. SSL_CERT_FILE is unset in both: Node's system store reads it, so the window would test nothing.
const CA_VARIABLES = {
    untrusted: { NODE_EXTRA_CA_CERTS: undefined, SSL_CERT_FILE: undefined },
    trusted: { NODE_EXTRA_CA_CERTS: INTERCEPT_CA, SSL_CERT_FILE: undefined },
} as const;
const folderWindow = (base.capabilities as WebdriverIO.Capabilities[])[0]!;

const trustWindow = (
    trust: keyof typeof CA_VARIABLES,
    userSettings: Record<string, unknown>,
): WebdriverIO.Capabilities => ({
    ...folderWindow,
    "databricks:caTrust": trust,
    "wdio:specs": [TRUST_SPEC],
    "wdio:exclude": OTHER_SPECS,
    "wdio:vscodeOptions": {
        ...folderWindow["wdio:vscodeOptions"],
        userSettings: {
            ...folderWindow["wdio:vscodeOptions"]?.userSettings,
            "http.proxy": interceptingProxy,
            ...userSettings,
        },
    },
});

export const config: WebdriverIO.Config = {
    ...base,
    // Specs that call the workspace themselves (destroy) reach the mock through its proxy.
    before() {
        http.setGlobalProxyFromEnv({ HTTPS_PROXY: proxy, NO_PROXY: "localhost,127.0.0.1" });
    },
    // The worker's own environment, not the launcher's: E2E_WORKERS runs several windows at once, and
    // the launcher's environment is shared by every worker it starts. Other windows keep what run-e2e.sh set.
    async beforeSession(config, capabilities, specs) {
        const trust = (capabilities as Record<string, unknown>)["databricks:caTrust"];
        if (trust === "untrusted" || trust === "trusted") {
            for (const [name, value] of Object.entries(CA_VARIABLES[trust])) {
                if (value === undefined) {
                    delete process.env[name];
                } else {
                    process.env[name] = value;
                }
            }
        }
        return base.beforeSession!(config, capabilities, specs);
    },
    capabilities: [
        ...(base.capabilities as WebdriverIO.Capabilities[]).map((c) => ({
            ...c,
            "wdio:vscodeOptions": {
                ...c["wdio:vscodeOptions"],
                userSettings: {
                    ...c["wdio:vscodeOptions"]?.userSettings,
                    "http.proxy": proxy,
                    "http.systemCertificates": false,
                },
            },
        })),
        // Verification off on purpose: this window tests the setting itself (http.proxyStrictSSL: false,
        // no CA trusted, the OS store off too). The one window that does.
        trustWindow("untrusted", {
            "http.proxyStrictSSL": false,
            "http.systemCertificates": false,
        }),
        trustWindow("trusted", {}),
    ],
};
