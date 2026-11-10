import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
    PALETTE,
    colorFor,
    copyProfile,
    dependencyClosure,
    extensionEntries,
    installedExtensions,
    previewSettings,
    maxSandboxName,
    runtimeVersion,
    sandboxName,
    sessionCompute,
    sessionCredentials,
    sessionEnv,
    windowTitle,
    withProfile,
} from "./lib.mjs";

/** An extensions folder with one subfolder per manifest. */
function extensionsDir(manifests) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "preview-test-"));
    for (const [folder, manifest] of Object.entries(manifests)) {
        fs.mkdirSync(path.join(dir, folder));
        fs.writeFileSync(path.join(dir, folder, "package.json"), JSON.stringify(manifest));
    }
    return dir;
}

await test("sandboxName", async (t) => {
    await t.test("is the branch, with what a path can't hold replaced", () => {
        assert.equal(
            sandboxName("feature/04-connection", "/x/databricks-vscode"),
            "feature-04-connection",
        );
    });

    await t.test("is the worktree's folder on a detached HEAD", () => {
        assert.equal(sandboxName("HEAD", "/x/databricks-vscode-main"), "databricks-vscode-main");
    });

    await t.test("is never a name that means the folder or its parent", () => {
        assert.equal(sandboxName("..", "/x/y"), "--");
        assert.equal(sandboxName(".", "/x/y"), "-");
        assert.equal(sandboxName("", "/x/y"), "y");
    });

    await t.test("is cut to fit the limit, without a trailing separator", () => {
        assert.equal(sandboxName("dev/account-only-profile", "/x/y", 22), "dev-account-only-profi");
        assert.equal(sandboxName("dev/account-only", "/x/y", 12), "dev-account");
        assert.equal(sandboxName("feature/04", "/x/y", 22), "feature-04");
    });
});

await test("maxSandboxName", async (t) => {
    await t.test("leaves VS Code's main socket in the sandbox at most 103 characters long", () => {
        const root = "/home/u/.cache/databricks-vscode-preview";
        const max = maxSandboxName(root);
        assert.equal(max, 37);
        const socket = path.join(root, "x".repeat(max), "user-data", "1.14-main.sock");
        assert.equal(socket.length, 103);
    });
});

await test("colorFor", async (t) => {
    await t.test("gives a name the same palette colour on every run", () => {
        assert.equal(colorFor("main"), colorFor("main"));
        assert.ok(PALETTE.includes(colorFor("main")));
    });

    await t.test("spreads names over the palette", () => {
        const colors = new Set(
            ["main", "pr-1", "pr-2", "pr-3", "hostless-login", "release-2.21.0"].map(colorFor),
        );
        assert.ok(colors.size >= 4, [...colors].join(" "));
    });
});

await test("windowTitle", async (t) => {
    await t.test("names the sandbox and the commit, and keeps VS Code's title after them", () => {
        assert.equal(
            windowTitle("main", { branch: "main", sha: "0123abc", dirty: false }),
            "main · 0123abc — ${rootName}${separator}${activeEditorShort}",
        );
    });

    await t.test("names a branch other than the sandbox, and uncommitted changes", () => {
        assert.match(
            windowTitle("review", { branch: "pr-7", sha: "abc1234", dirty: true }),
            /^review · pr-7@abc1234\+wip — /,
        );
    });
});

await test("previewSettings", async (t) => {
    await t.test("keeps the sandbox's own settings, and sets the title and colours", () => {
        const settings = previewSettings(
            {
                "editor.fontSize": 14,
                "window.title": "old",
                "workbench.colorCustomizations": { "editor.background": "#000000" },
            },
            { title: "new", color: "#123456" },
        );
        assert.equal(settings["editor.fontSize"], 14);
        assert.equal(settings["window.title"], "new");
        assert.equal(settings["workbench.colorCustomizations"]["editor.background"], "#000000");
        assert.equal(
            settings["workbench.colorCustomizations"]["titleBar.activeBackground"],
            "#123456",
        );
        assert.equal(
            settings["workbench.colorCustomizations"]["statusBar.noFolderBackground"],
            "#123456",
        );
    });

    await t.test(
        "turns the YAML extension's telemetry prompt off, unless the sandbox has turned it on",
        () => {
            assert.equal(
                previewSettings({}, { title: "t", color: "#123456" })["redhat.telemetry.enabled"],
                false,
            );
            assert.equal(
                previewSettings(
                    { "redhat.telemetry.enabled": true },
                    { title: "t", color: "#123456" },
                )["redhat.telemetry.enabled"],
                true,
            );
        },
    );

    await t.test("allows the chat without a sign-in, unless the sandbox has turned it off", () => {
        assert.equal(
            previewSettings({}, { title: "t", color: "#123456" })["chat.allowAnonymousAccess"],
            true,
        );
        assert.equal(
            previewSettings(
                { "chat.allowAnonymousAccess": false },
                { title: "t", color: "#123456" },
            )["chat.allowAnonymousAccess"],
            false,
        );
    });
});

await test("copyProfile", async (t) => {
    const config = [
        "; a comment",
        "[DEFAULT]",
        "host = https://default.example.com",
        "",
        "[work]",
        "host      = https://work.example.com",
        "auth_type = databricks-cli",
        "",
        "[sp]",
        "host = https://sp.example.com",
        "client_id = abc",
        "client_secret = s3cret",
        "token = dapi123",
    ].join("\n");

    await t.test("copies the profile's keys", () => {
        assert.equal(
            copyProfile(config, "work"),
            "[work]\nhost = https://work.example.com\nauth_type = databricks-cli\n",
        );
    });

    await t.test("leaves its secrets out", () => {
        assert.equal(
            copyProfile(config, "sp"),
            "[sp]\nhost = https://sp.example.com\nclient_id = abc\n",
        );
    });

    await t.test("finds no profile that isn't there", () => {
        assert.equal(copyProfile(config, "nope"), undefined);
    });
});

await test("withProfile", async (t) => {
    const section = "[work]\nhost = https://new.example.com\n";

    await t.test("adds a profile to an empty config file", () => {
        assert.equal(withProfile("", "work", section), section);
    });

    await t.test("replaces the profile of that name, and keeps the others", () => {
        const config =
            "[a]\nhost = https://a\n\n[work]\nhost = https://old\n\n[b]\nhost = https://b\n";
        assert.equal(
            withProfile(config, "work", section),
            `[a]\nhost = https://a\n\n[b]\nhost = https://b\n\n${section}`,
        );
    });
});

await test("installedExtensions", async (t) => {
    await t.test("finds each extension's newest version, by lower-case ID", () => {
        const dir = extensionsDir({
            "ms-python.python-2026.2.0": {
                publisher: "ms-python",
                name: "python",
                version: "2026.2.0",
            },
            "ms-python.python-2026.10.0": {
                publisher: "ms-python",
                name: "python",
                version: "2026.10.0",
            },
            "RedHat.vscode-yaml-1.0.0": {
                publisher: "RedHat",
                name: "vscode-yaml",
                version: "1.0.0",
            },
        });
        fs.mkdirSync(path.join(dir, ".obsolete-folder"));
        const found = installedExtensions(dir);
        assert.deepEqual(
            [...found.keys()].sort((a, b) => a.localeCompare(b)),
            ["ms-python.python", "redhat.vscode-yaml"],
        );
        assert.equal(found.get("ms-python.python").folder, "ms-python.python-2026.10.0");
    });

    await t.test("finds none in a folder that isn't there", () => {
        assert.equal(installedExtensions(path.join(os.tmpdir(), "no-such-preview-folder")).size, 0);
    });
});

await test("dependencyClosure", async (t) => {
    const installed = new Map(
        [
            {
                publisher: "a",
                name: "root",
                version: "1",
                extensionDependencies: ["a.dep"],
                extensionPack: ["a.pack"],
            },
            { publisher: "a", name: "dep", version: "1", extensionDependencies: ["A.Root"] },
            { publisher: "a", name: "pack", version: "1" },
            { publisher: "a", name: "unrelated", version: "1" },
        ].map((manifest) => [
            `${manifest.publisher}.${manifest.name}`,
            { folder: `${manifest.name}-1`, manifest },
        ]),
    );

    await t.test("follows dependencies and packs, through cycles", () => {
        const { needed, missing } = dependencyClosure(["a.root"], installed);
        assert.deepEqual(
            [...needed.keys()].sort((a, b) => a.localeCompare(b)),
            ["a.dep", "a.pack", "a.root"],
        );
        assert.deepEqual(missing, []);
    });

    await t.test("lists what isn't installed", () => {
        assert.deepEqual(dependencyClosure(["a.dep", "b.gone", "a.gone"], installed).missing, [
            "a.gone",
            "b.gone",
        ]);
    });
});

await test("extensionEntries", async (t) => {
    const yaml = {
        folder: "redhat.vscode-yaml-1.0.0",
        manifest: { publisher: "redhat", name: "vscode-yaml", version: "1.0.0" },
    };
    const python = {
        folder: "ms-python.python-2.0.0",
        manifest: { publisher: "ms-python", name: "python", version: "2.0.0" },
    };
    const source = [
        {
            identifier: { id: "redhat.vscode-yaml", uuid: "u-1" },
            version: "1.0.0",
            location: {
                $mid: 1,
                path: "/home/.vscode/extensions/redhat.vscode-yaml-1.0.0",
                scheme: "file",
            },
            relativeLocation: "redhat.vscode-yaml-1.0.0",
            metadata: { installedTimestamp: 1 },
        },
    ];

    await t.test("moves a copied entry's location into the sandbox, and keeps its metadata", () => {
        const [entry] = extensionEntries([], [yaml], source, "/sandbox/extensions");
        assert.equal(
            entry.location.path,
            path.join("/sandbox/extensions", "redhat.vscode-yaml-1.0.0"),
        );
        assert.deepEqual(entry.identifier, { id: "redhat.vscode-yaml", uuid: "u-1" });
        assert.deepEqual(entry.metadata, { installedTimestamp: 1 });
    });

    await t.test("writes an entry for a folder the source doesn't list", () => {
        const [entry] = extensionEntries([], [python], source, "/sandbox/extensions");
        assert.deepEqual(entry.identifier, { id: "ms-python.python" });
        assert.equal(entry.version, "2.0.0");
    });

    await t.test("keeps the sandbox's entries, and adds none twice", () => {
        const existing = [
            {
                relativeLocation: "redhat.vscode-yaml-1.0.0",
                location: { path: "/sandbox/extensions/redhat.vscode-yaml-1.0.0" },
            },
        ];
        assert.deepEqual(
            extensionEntries(existing, [yaml], source, "/sandbox/extensions"),
            existing,
        );
    });
});

await test("sessionCompute", async (t) => {
    await t.test("is serverless, or a cluster by its ID", () => {
        assert.deepEqual(sessionCompute("serverless"), { kind: "serverless" });
        assert.deepEqual(sessionCompute("0123-456789-abcdefgh"), {
            kind: "cluster",
            clusterId: "0123-456789-abcdefgh",
        });
    });

    await t.test("refuses what can't be a cluster's ID", () => {
        assert.equal(sessionCompute(""), undefined);
        assert.equal(sessionCompute("a b"), undefined);
    });
});

await test("sessionCredentials", async (t) => {
    const config = [
        "[pat]",
        "host = https://pat.example.com",
        "token = dapi123",
        "",
        "[m2m]",
        "host = https://m2m.example.com",
        "client_id = id",
        "client_secret = secret",
        "",
        "[oauth]",
        "host = https://oauth.example.com",
        "auth_type = databricks-cli",
        "",
        "[half-m2m]",
        "host = https://m2m.example.com",
        "client_id = id",
        "",
    ].join("\n");

    await t.test("takes a profile's token", () => {
        assert.deepEqual(sessionCredentials(config, "pat"), {
            host: "https://pat.example.com",
            credentials: { DATABRICKS_TOKEN: "dapi123" },
        });
    });

    await t.test("takes a profile's M2M client", () => {
        assert.deepEqual(sessionCredentials(config, "m2m"), {
            host: "https://m2m.example.com",
            credentials: { DATABRICKS_CLIENT_ID: "id", DATABRICKS_CLIENT_SECRET: "secret" },
        });
    });

    await t.test("has no credentials for OAuth, or an M2M client without its secret", () => {
        assert.deepEqual(sessionCredentials(config, "oauth"), {
            host: "https://oauth.example.com",
            credentials: undefined,
        });
        assert.equal(sessionCredentials(config, "half-m2m").credentials, undefined);
    });

    await t.test("is undefined for a profile the file doesn't have", () => {
        assert.equal(sessionCredentials(config, "missing"), undefined);
    });
});

await test("runtimeVersion", () => {
    assert.equal(runtimeVersion("17.3.x-scala2.13"), "17.3");
    assert.equal(runtimeVersion("15.4.x-gpu-ml-scala2.12"), "15.4");
    assert.equal(runtimeVersion("custom"), undefined);
    assert.equal(runtimeVersion(undefined), undefined);
});

await test("sessionEnv", async (t) => {
    const base = {
        host: "https://w.example.com",
        credentials: { DATABRICKS_TOKEN: "t" },
        interpreter: "/s/session-venv/bin/python",
    };

    await t.test("is a serverless session's, as the tunnel's bootstrap sets it", () => {
        assert.deepEqual(sessionEnv({ ...base, compute: { kind: "serverless" } }), {
            DATABRICKS_REMOTE_ENV: "1",
            DATABRICKS_HOST: "https://w.example.com",
            DATABRICKS_TOKEN: "t",
            DATABRICKS_VIRTUAL_ENV: "/s/session-venv/bin/python",
            DATABRICKS_CLUSTER_ID: "preview-serverless-session",
            IS_SERVERLESS: "TRUE",
            DATABRICKS_RUNTIME_VERSION: "client.4.10",
        });
    });

    await t.test("names a cluster and its runtime, and isn't serverless", () => {
        const env = sessionEnv({
            ...base,
            compute: { kind: "cluster", clusterId: "c-1", runtimeVersion: "17.3" },
        });
        assert.equal(env.DATABRICKS_CLUSTER_ID, "c-1");
        assert.equal(env.DATABRICKS_RUNTIME_VERSION, "17.3");
        assert.equal(env.IS_SERVERLESS, undefined);
    });

    await t.test("leaves the runtime out when the cluster's is unknown", () => {
        const env = sessionEnv({ ...base, compute: { kind: "cluster", clusterId: "c-1" } });
        assert.equal("DATABRICKS_RUNTIME_VERSION" in env, false);
    });

    await t.test("carries an M2M client", () => {
        const env = sessionEnv({
            ...base,
            credentials: { DATABRICKS_CLIENT_ID: "id", DATABRICKS_CLIENT_SECRET: "s" },
            compute: { kind: "serverless" },
        });
        assert.equal(env.DATABRICKS_CLIENT_ID, "id");
        assert.equal(env.DATABRICKS_CLIENT_SECRET, "s");
        assert.equal("DATABRICKS_TOKEN" in env, false);
    });
});
