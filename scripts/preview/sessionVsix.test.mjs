import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
    MARKETPLACE_EXTENSION,
    EARLIER_EXTENSION,
    PROBE_SCRIPT,
    canonicalHost,
    installScript,
    linuxTarget,
    parseProbe,
    pickServer,
    shellQuote,
    sshHostAlias,
} from "./sessionVsix.mjs";

const COMMIT = "fedcba9876543210fedcba9876543210fedcba98";
const OLD_COMMIT = "0123456789abcdef0123456789abcdef01234567";

/** A home folder with a VS Code server whose CLI logs its arguments and lists `installed`. */
function fakeHome(serverDir, installed) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "session-vsix-test-"));
    const bin = path.join(home, ".vscode-server", serverDir, "bin");
    fs.mkdirSync(bin, { recursive: true });
    const cli = path.join(bin, "code-server");
    fs.writeFileSync(
        cli,
        [
            "#!/bin/sh",
            `echo "$*" >> "$HOME/calls"`,
            `if [ "$1" = --install-extension ]; then cp "$2" "$HOME/installed.vsix"; fi`,
            `if [ "$1" = --list-extensions ]; then printf '%s\\n' ${installed.map(shellQuote).join(" ")}; fi`,
        ].join("\n"),
        { mode: 0o755 },
    );
    return { home, cli };
}

/** Runs a script as ssh would, in a shell, with that home folder. */
function sh(script, home, input) {
    return execFileSync("sh", ["-c", script], {
        env: { PATH: process.env.PATH, HOME: home },
        input,
        encoding: "utf-8",
    });
}

await test("canonicalHost", async (t) => {
    await t.test("keeps the scheme and authority, as the CLI's SDK does", () => {
        assert.equal(
            canonicalHost("https://adb-1.azuredatabricks.net/"),
            "https://adb-1.azuredatabricks.net",
        );
        assert.equal(
            canonicalHost("HTTPS://adb-1.azuredatabricks.net/?o=1#x"),
            "https://adb-1.azuredatabricks.net",
        );
        assert.equal(
            canonicalHost("adb-1.azuredatabricks.net"),
            "https://adb-1.azuredatabricks.net",
        );
        assert.equal(canonicalHost("http://localhost:8080/path"), "http://localhost:8080");
    });
});

await test("sshHostAlias", async (t) => {
    await t.test("is a cluster's ID", () => {
        assert.equal(
            sshHostAlias({ kind: "cluster", clusterId: "0123-456789-abcdefgh" }),
            "0123-456789-abcdefgh",
        );
    });
    await t.test("is, for serverless, named after the canonical host, as the CLI names it", () => {
        // md5("https://example-serverless.cloud.databricks.com") starts with 70b61b07, the
        // name `databricks ssh connect` gives a serverless session on that host.
        const alias = "databricks-cpu-70b61b07";
        assert.equal(
            sshHostAlias({ kind: "serverless" }, "https://example-serverless.cloud.databricks.com"),
            alias,
        );
        assert.equal(
            sshHostAlias({ kind: "serverless" }, "example-serverless.cloud.databricks.com/"),
            alias,
        );
    });
});

await test("linuxTarget", async (t) => {
    await t.test("maps uname -m to vsce's Linux targets", () => {
        assert.equal(linuxTarget("x86_64"), "linux-x64");
        assert.equal(linuxTarget("aarch64"), "linux-arm64");
        assert.equal(linuxTarget("arm64"), "linux-arm64");
        assert.equal(linuxTarget("riscv64"), undefined);
    });
});

await test("shellQuote", async (t) => {
    await t.test("survives a shell, quotes and spaces included", () => {
        const word = `it's a "path" $HOME`;
        assert.equal(
            execFileSync("sh", ["-c", `printf %s ${shellQuote(word)}`], { encoding: "utf-8" }),
            word,
        );
    });
});

await test("PROBE_SCRIPT and parseProbe", async (t) => {
    // The probe runs on the session's Linux host. On Windows, `sh` is Git Bash, which reports MSYS paths.
    const skip = process.platform === "win32" && "a Linux shell script";
    await t.test(
        "find the machine and each server, of both layouts, newest first",
        { skip },
        () => {
            const current = fakeHome(`cli/servers/Stable-${COMMIT}/server`, []);
            const legacy = path.join(current.home, ".vscode-server", "bin", OLD_COMMIT, "bin");
            fs.mkdirSync(legacy, { recursive: true });
            fs.copyFileSync(current.cli, path.join(legacy, "code-server"));
            fs.utimesSync(path.join(legacy, "code-server"), 1, 1);
            const probe = parseProbe(sh(PROBE_SCRIPT, current.home));
            assert.equal(
                probe.machine,
                execFileSync("uname", ["-m"], { encoding: "utf-8" }).trim(),
            );
            assert.deepEqual(probe.servers, [
                { cli: current.cli, commit: COMMIT },
                { cli: path.join(legacy, "code-server"), commit: OLD_COMMIT },
            ]);
        },
    );
    await t.test("find no server in a home folder without one", () => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), "session-vsix-test-"));
        assert.deepEqual(parseProbe(sh(PROBE_SCRIPT, home)).servers, []);
    });
});

await test("pickServer", async (t) => {
    // Newest first, as parseProbe gives them.
    const servers = [
        { cli: "b", commit: OLD_COMMIT },
        { cli: "a", commit: COMMIT },
    ];
    await t.test("is the local VS Code's server", () => {
        assert.equal(pickServer(servers, COMMIT).cli, "a");
    });
    await t.test("is otherwise the newest", () => {
        assert.equal(pickServer(servers, "f".repeat(40)).cli, "b");
        assert.equal(pickServer(servers, undefined).cli, "b");
    });
    await t.test("is undefined without servers", () => {
        assert.equal(pickServer([], COMMIT), undefined);
    });
});

await test("installScript", async (t) => {
    await t.test(
        "installs the VSIX from standard input, and uninstalls a build under the earlier ID",
        () => {
            const { home, cli } = fakeHome(`cli/servers/Stable-${COMMIT}/server`, [
                "ms-python.python",
                MARKETPLACE_EXTENSION,
                EARLIER_EXTENSION,
            ]);
            sh(installScript(cli), home, "the vsix");
            assert.equal(fs.readFileSync(path.join(home, "installed.vsix"), "utf-8"), "the vsix");
            const calls = fs.readFileSync(path.join(home, "calls"), "utf-8").trim().split("\n");
            assert.match(calls[0], /^--install-extension \S+\/databricks\.vsix --force$/);
            assert.deepEqual(calls.slice(1), [
                "--list-extensions",
                `--uninstall-extension ${EARLIER_EXTENSION}`,
            ]);
            // The temporary VSIX is gone.
            assert.ok(!fs.existsSync(calls[0].split(" ")[1]));
        },
    );
    await t.test("uninstalls nothing when only the Marketplace extension's ID is there", () => {
        // The build, installed over it: its ID is a prefix of the other, not a match.
        const { home, cli } = fakeHome("bin/x", [MARKETPLACE_EXTENSION]);
        sh(installScript(cli), home, "the vsix");
        const calls = fs.readFileSync(path.join(home, "calls"), "utf-8").trim().split("\n");
        assert.deepEqual(calls.slice(1), ["--list-extensions"]);
    });
    await t.test("stops when the install fails", () => {
        const { home, cli } = fakeHome("bin/x", [EARLIER_EXTENSION]);
        fs.appendFileSync(cli, `\nif [ "$1" = --install-extension ]; then exit 1; fi\n`);
        assert.throws(() => sh(installScript(cli), home, "the vsix"));
        assert.equal(
            fs.readFileSync(path.join(home, "calls"), "utf-8").trim().split("\n").length,
            1,
        );
    });
});
