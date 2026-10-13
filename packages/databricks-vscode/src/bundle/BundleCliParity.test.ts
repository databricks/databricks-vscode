import {EventEmitter, Uri, WorkspaceFolder} from "vscode";
import {expect} from "chai";
import path from "path";
import {spawnSync} from "child_process";
import * as tmp from "tmp-promise";
import * as fs from "fs/promises";
import {instance, mock, when} from "ts-mockito";
import {BundleFileSet} from "./BundleFileSet";
import {BundleWatcher} from "./BundleWatcher";
import {BundlePreValidateModel} from "./models/BundlePreValidateModel";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";

// The bundled CLI, fetched into bin/ by `package:cli:fetch` (run in the
// unit-tests CI job). From the compiled test at out/bundle/*.js the binary is
// two directories up, at <package>/bin/databricks.
const cliPath = path.resolve(__dirname, "..", "..", "bin", "databricks");

// Does the bundled binary run on this platform? It's platform-specific, so a
// dev checkout can hold a mismatched or missing binary (spawn fails with
// ENOENT / ENOEXEC) — skip there rather than fail. CI fetches the right one.
function cliRunnable(): boolean {
    const probe = spawnSync(cliPath, ["version", "--output", "json"], {
        encoding: "utf-8",
        timeout: 30000,
    });
    return !probe.error && probe.status === 0;
}

// Run the bundled CLI the way the extension does: from the project folder as
// cwd (like runBundleCommand), so the CLI resolves the bundle root by walking up
// from there — unless `pinnedRoot` is given, mirroring the DATABRICKS_BUNDLE_ROOT
// the extension sets in remote mode. We deliberately do *not* hard-code
// DATABRICKS_BUNDLE_ROOT, so the walk-up case below exercises the CLI's real root
// resolution. A fake token plus a non-existent HOME and non-resolving (.invalid)
// hosts mean the run resolves the config, prints it as JSON, then fails at the
// auth step (exit 1). The resolved workspace is on stdout regardless.
function cliResolvedWorkspace(
    cwd: string,
    target: string,
    opts: {pinnedRoot?: string; configFile?: string} = {}
): {host?: string; profile?: string} | undefined {
    const result = spawnSync(
        cliPath,
        ["bundle", "validate", "-t", target, "-o", "json"],
        {
            encoding: "utf-8",
            timeout: 60000,
            maxBuffer: 10 * 1024 * 1024,
            cwd,
            env: {
                /* eslint-disable @typescript-eslint/naming-convention */
                PATH: process.env.PATH,
                HOME: path.join(cwd, "empty-home"),
                DATABRICKS_HOST: "https://session.invalid",
                DATABRICKS_TOKEN: "dapiTEST",
                DATABRICKS_CONFIG_FILE:
                    opts.configFile ?? path.join(cwd, "no-such-cfg"),
                ...(opts.pinnedRoot
                    ? {DATABRICKS_BUNDLE_ROOT: opts.pinnedRoot}
                    : {}),
                /* eslint-enable @typescript-eslint/naming-convention */
            },
        }
    );
    if (result.error || typeof result.stdout !== "string") {
        return undefined;
    }
    try {
        return JSON.parse(result.stdout)?.workspace;
    } catch {
        return undefined;
    }
}

function cliResolvedHost(
    cwd: string,
    target: string,
    opts: {pinnedRoot?: string; configFile?: string} = {}
): string | undefined {
    return cliResolvedWorkspace(cwd, target, opts)?.host;
}

/**
 * Pins BundleFileSet's include glob + merge to the bundled CLI's own
 * behaviour, so a CLI version bump that changes how includes are globbed,
 * ordered or merged (the reviewer's meta-point: each round found a new
 * divergence) trips here instead of silently diverging the credential guard.
 * We compare the host each side resolves rather than a hard-coded copy of the
 * CLI's output.
 */
describe("BundleFileSet vs bundled CLI (glob/merge parity)", async function () {
    this.timeout(90000);
    let tmpdir: tmp.DirectoryResult;

    before(function () {
        if (!cliRunnable()) {
            this.skip();
        }
    });

    beforeEach(async () => {
        tmpdir = await tmp.dir({unsafeCleanup: true});
    });

    afterEach(async () => {
        await tmpdir.cleanup();
    });

    function makeModel(root: string = tmpdir.path) {
        const workspaceFolderManager = mock<WorkspaceFolderManager>();
        const workspaceFolder = mock<WorkspaceFolder>();
        const uri = Uri.file(root);
        when(workspaceFolder.uri).thenReturn(uri);
        when(workspaceFolderManager.activeWorkspaceFolder).thenReturn(
            instance(workspaceFolder)
        );
        when(workspaceFolderManager.activeProjectUri).thenReturn(uri);
        const bundleFileSet = new BundleFileSet(
            instance(workspaceFolderManager)
        );
        const watcher = mock<BundleWatcher>();
        when(watcher.onDidChange).thenReturn(new EventEmitter<void>().event);
        return new BundlePreValidateModel(bundleFileSet, instance(watcher));
    }

    async function writeBundleFile(relPath: string, contents: string) {
        const abs = path.join(tmpdir.path, relPath);
        await fs.mkdir(path.dirname(abs), {recursive: true});
        await fs.writeFile(abs, contents);
    }

    function extensionResolvedHost(
        ws: {host?: string; profile?: string} | string | undefined
    ): string | undefined {
        return typeof ws === "object" ? ws?.host : undefined;
    }

    function extensionResolvedProfile(
        ws: {host?: string; profile?: string} | string | undefined
    ): string | undefined {
        return typeof ws === "object" ? ws?.profile : undefined;
    }

    it("resolves the host a sorted include decides, same as the CLI (Repro A)", async () => {
        // Both files set the host; after a byte-wise sort the last one
        // (targets/z.yml) wins. The extension must pick the same file the CLI
        // does, or the guard reads a host the CLI never deploys to.
        await writeBundleFile(
            "databricks.yml",
            [
                "bundle:",
                "  name: p",
                'include: ["targets/*.yml"]',
                "targets:",
                "  dev:",
                "    default: true",
                "",
            ].join("\n")
        );
        await writeBundleFile(
            path.join("targets", "a.yml"),
            "targets:\n  dev:\n    workspace:\n      host: https://repro-a.invalid\n"
        );
        await writeBundleFile(
            path.join("targets", "z.yml"),
            "targets:\n  dev:\n    workspace:\n      host: https://repro-z.invalid\n"
        );

        const cliHost = cliResolvedHost(tmpdir.path, "dev");
        const extHost = extensionResolvedHost(
            await makeModel().getTargetWorkspaceFromDisk("dev")
        );

        expect(cliHost, "CLI should resolve a host").to.be.a("string");
        expect(extHost).to.equal(cliHost);
        expect(extHost).to.equal("https://repro-z.invalid");
    });

    it("excludes files ** must not reach, same as the CLI (Repro B)", async () => {
        // Go's glob has no `**`, so conf/**/*.yml reaches exactly one directory
        // deep: conf/a/a.yml loads, conf/a/z/z.yml does not. node-glob's
        // recursive `**` would merge the deeper file (whose host sorts last and
        // would win), diverging from the CLI.
        await writeBundleFile(
            "databricks.yml",
            [
                "bundle:",
                "  name: p",
                'include: ["conf/**/*.yml"]',
                "targets:",
                "  dev:",
                "    default: true",
                "",
            ].join("\n")
        );
        await writeBundleFile(
            path.join("conf", "a", "a.yml"),
            "targets:\n  dev:\n    workspace:\n      host: https://shallow.invalid\n"
        );
        await writeBundleFile(
            path.join("conf", "a", "z", "z.yml"),
            "targets:\n  dev:\n    workspace:\n      host: https://deep.invalid\n"
        );

        const cliHost = cliResolvedHost(tmpdir.path, "dev");
        const extHost = extensionResolvedHost(
            await makeModel().getTargetWorkspaceFromDisk("dev")
        );

        expect(cliHost, "CLI should resolve a host").to.be.a("string");
        expect(extHost).to.equal(cliHost);
        expect(extHost).to.equal("https://shallow.invalid");
    });

    it("merges a `<<` sequence the same host as the CLI (last-map-wins)", async () => {
        // A sequence merge key is first-map-wins in the JS parser but
        // last-map-wins in the CLI. parseBundleYaml reverses the sequence to
        // match, so both resolve the second map's host (other.invalid).
        await writeBundleFile(
            "databricks.yml",
            [
                "x-s: &s {host: https://seq-session.invalid}",
                "x-o: &o {host: https://seq-other.invalid}",
                "bundle: {name: p}",
                "targets:",
                "  dev:",
                "    default: true",
                "    workspace:",
                "      <<: [*s, *o]",
                "",
            ].join("\n")
        );

        const cliHost = cliResolvedHost(tmpdir.path, "dev");
        const extHost = extensionResolvedHost(
            await makeModel().getTargetWorkspaceFromDisk("dev")
        );

        expect(cliHost, "CLI should resolve a host").to.be.a("string");
        expect(extHost).to.equal(cliHost);
        expect(extHost).to.equal("https://seq-other.invalid");
    });

    it("flags a `[!…]` include the CLI reads differently, and fails closed", async () => {
        // Go's filepath.Match reads `[!_]` as the literal chars `!`/`_`; node-glob
        // negates it. So the extension's raw merge loads conf/dev.yml while the
        // CLI never does. We can't reconcile the file sets, so the model flags
        // the pattern and the guard fails closed.
        await writeBundleFile(
            "databricks.yml",
            [
                "bundle:",
                "  name: p",
                'include: ["conf/[!_]*.yml"]',
                "targets:",
                "  dev:",
                "    default: true",
                "",
            ].join("\n")
        );
        await writeBundleFile(
            path.join("conf", "dev.yml"),
            "targets:\n  dev:\n    workspace:\n      host: https://negated.invalid\n"
        );

        const model = makeModel();
        // node-glob's negation loads conf/dev.yml into the extension's merge...
        expect(
            extensionResolvedHost(await model.getTargetWorkspaceFromDisk("dev"))
        ).to.equal("https://negated.invalid");
        // ...but the CLI never loads it, so it resolves a different host.
        expect(cliResolvedHost(tmpdir.path, "dev")).to.not.equal(
            "https://negated.invalid"
        );
        // The model flags the pattern so the guard refuses rather than trust the
        // divergent file set.
        expect(await model.hasUnsupportedIncludeGlob()).to.be.true;
    });

    it("reverses a tagged `!!merge` sequence the same host as the CLI", async () => {
        // A merge key can be tagged (`!!merge foo`); its source text isn't `<<`,
        // so we detect it by the parsed merge symbol and still reverse to the
        // CLI's last-map-wins.
        await writeBundleFile(
            "databricks.yml",
            [
                "x-s: &s {host: https://tag-session.invalid}",
                "x-o: &o {host: https://tag-other.invalid}",
                "bundle: {name: p}",
                "targets:",
                "  dev:",
                "    default: true",
                "    workspace:",
                "      !!merge foo: [*s, *o]",
                "",
            ].join("\n")
        );

        const cliHost = cliResolvedHost(tmpdir.path, "dev");
        const extHost = extensionResolvedHost(
            await makeModel().getTargetWorkspaceFromDisk("dev")
        );

        expect(cliHost, "CLI should resolve a host").to.be.a("string");
        expect(extHost).to.equal(cliHost);
        expect(extHost).to.equal("https://tag-other.invalid");
    });

    it("keeps the earlier host when a later file sets it null, like the CLI", async () => {
        // `lodash.merge` would let the include's `workspace: ~` blank the host;
        // mergeBundleData keeps the root's host, matching the CLI.
        await writeBundleFile(
            "databricks.yml",
            [
                "bundle: {name: p}",
                'include: ["targets/*.yml"]',
                "workspace: {host: https://null-root.invalid}",
                "targets: {dev: {default: true}}",
                "",
            ].join("\n")
        );
        await writeBundleFile(path.join("targets", "a.yml"), "workspace: ~\n");

        const cliHost = cliResolvedHost(tmpdir.path, "dev");
        const extHost = extensionResolvedHost(
            await makeModel().getTargetWorkspaceFromDisk("dev")
        );

        expect(cliHost, "CLI should resolve a host").to.be.a("string");
        expect(extHost).to.equal(cliHost);
        expect(extHost).to.equal("https://null-root.invalid");
    });

    it("does not re-merge a root file matched by an include, like the CLI", async () => {
        // `include: ["*.yml"]` matches databricks.yml; the CLI never re-loads it,
        // so the include (a.yml) wins. The extension must drop the root file from
        // the matches, or its empty host would win and blank the resolved host.
        await writeBundleFile(
            "databricks.yml",
            [
                "bundle: {name: p}",
                'include: ["*.yml"]',
                'targets: {dev: {default: true, workspace: {host: ""}}}',
                "",
            ].join("\n")
        );
        await writeBundleFile(
            "a.yml",
            "targets: {dev: {workspace: {host: https://root-twice.invalid}}}\n"
        );

        const cliHost = cliResolvedHost(tmpdir.path, "dev");
        const extHost = extensionResolvedHost(
            await makeModel().getTargetWorkspaceFromDisk("dev")
        );

        expect(cliHost, "CLI should resolve a host").to.be.a("string");
        expect(extHost).to.equal(cliHost);
        expect(extHost).to.equal("https://root-twice.invalid");
    });

    it("flags a POSIX `[[:alpha:]]` include the CLI reads differently", async () => {
        // Go has no POSIX classes: `[[:alpha:]]` is a literal set there but "one
        // letter" to minimatch, so the file sets diverge. The model fails closed.
        await writeBundleFile(
            "databricks.yml",
            [
                "bundle: {name: p}",
                'include: ["conf/[[:alpha:]]*.yml"]',
                "targets: {dev: {default: true}}",
                "",
            ].join("\n")
        );
        await writeBundleFile(
            path.join("conf", "dev.yml"),
            "targets: {dev: {workspace: {host: https://posix.invalid}}}\n"
        );

        expect(await makeModel().hasUnsupportedIncludeGlob()).to.be.true;
    });

    it("keeps the global host when the target host is '', same as the CLI", async () => {
        // mergeBundleData only keeps the earlier value for null, so a target
        // `host: ""` would blank the global host — the guard would then read no
        // host (→ session, allowed) while the CLI keeps the global host and sends
        // the token there. getRawTargetData drops the empty host so the global
        // one survives, matching the CLI.
        await writeBundleFile(
            "databricks.yml",
            [
                "bundle: {name: p}",
                "workspace: {host: https://global-host.invalid}",
                "targets:",
                "  dev:",
                "    default: true",
                "    workspace:",
                '      host: ""',
                "",
            ].join("\n")
        );

        const cliHost = cliResolvedHost(tmpdir.path, "dev");
        const extHost = extensionResolvedHost(
            await makeModel().getTargetWorkspaceFromDisk("dev")
        );

        expect(cliHost, "CLI should resolve a host").to.be.a("string");
        expect(extHost).to.equal(cliHost);
        expect(extHost).to.equal("https://global-host.invalid");
    });

    it("keeps the global profile when the target profile is '', same as the CLI", async () => {
        // The same hole via profile: a target `profile: ""` must not blank the
        // global profile. The CLI keeps the global profile (and takes its host
        // from there, overriding DATABRICKS_HOST); the extension keeps it too, so
        // the guard fails closed on the profile instead of reading the session
        // host and allowing. The CLI leaves workspace.host unset here and resolves
        // auth from the profile, so this case compares the profile, not the host.
        await writeBundleFile(
            "databricks.yml",
            [
                "bundle: {name: p}",
                "workspace: {profile: p1}",
                "targets:",
                "  dev:",
                "    default: true",
                "    workspace:",
                '      profile: ""',
                "",
            ].join("\n")
        );
        const configFile = path.join(tmpdir.path, "cfg");
        await fs.writeFile(
            configFile,
            "[p1]\nhost = https://profile-p1.invalid\ntoken = dapiTEST\n"
        );

        const cliWs = cliResolvedWorkspace(tmpdir.path, "dev", {configFile});
        const extWs = await makeModel().getTargetWorkspaceFromDisk("dev");

        expect(cliWs?.profile).to.equal("p1");
        expect(extensionResolvedProfile(extWs)).to.equal("p1");
        expect(extensionResolvedProfile(extWs)).to.equal(cliWs?.profile);
    });

    it("forces a missing config file so default_profile can't redirect the session token, same as the CLI", async () => {
        // The CLI's configureProfile (cmd/root/bundle.go) reads
        // [__settings__].default_profile and sets it as workspace.profile even
        // when DATABRICKS_HOST is set, so a host-less, profile-less target
        // authenticates against the default profile's host with the session
        // token. The extension reads no host/profile from the YAML here (→
        // session, which the guard allows), so remote mode must stop the CLI
        // reading .databrickscfg at all: it points DATABRICKS_CONFIG_FILE at a
        // path that does not exist. This proves that is both necessary (the leak
        // is real) and sufficient (it closes it).
        await writeBundleFile(
            "databricks.yml",
            ["bundle: {name: p}", "targets: {dev: {default: true}}", ""].join(
                "\n"
            )
        );
        const configFile = path.join(tmpdir.path, "cfg");
        await fs.writeFile(
            configFile,
            [
                "[__settings__]",
                "default_profile = p",
                "",
                "[p]",
                "host = https://other.invalid",
                "token = dapiTEST",
                "",
            ].join("\n")
        );

        // The leak: with a readable config file the CLI injects the default
        // profile and would send the session token to its host. The CLI resolves
        // auth from the profile and leaves workspace.host unset, so compare the
        // profile (see the empty-profile case above).
        const leaked = cliResolvedWorkspace(tmpdir.path, "dev", {configFile});
        expect(leaked?.profile).to.equal("p");

        // The fix: with a non-existent config file (the default here, exactly
        // what the extension forces in remote mode) the CLI reads no profile and
        // falls back to DATABRICKS_HOST — the session host.
        const fixed = cliResolvedWorkspace(tmpdir.path, "dev");
        expect(fixed?.profile).to.not.equal("p");
        expect(fixed?.host).to.not.equal("https://other.invalid");

        // The extension reads no host and no profile from the YAML — the session
        // case the guard allows, now correct because the CLI ignores .databrickscfg.
        const extWs = await makeModel().getTargetWorkspaceFromDisk("dev");
        expect(extensionResolvedHost(extWs)).to.be.undefined;
        expect(extensionResolvedProfile(extWs)).to.be.undefined;
    });

    it("resolves the project folder's root, not a parent's, same as the pinned CLI", async () => {
        // Without DATABRICKS_BUNDLE_ROOT the CLI finds the bundle root by walking
        // up from the cwd, so a parent `databricks.yml` (host: parent) wins over
        // the project folder's `databricks.yaml` (no host). The guard reads only
        // the project folder, so the extension sets DATABRICKS_BUNDLE_ROOT to it
        // in remote mode. This proves the pin is necessary: the unpinned CLI picks
        // the parent host, while the pinned CLI and the extension both read the
        // host-less child (session host).
        await writeBundleFile(
            "databricks.yml",
            [
                "bundle: {name: parent}",
                "targets:",
                "  dev:",
                "    default: true",
                "    workspace:",
                "      host: https://parent.invalid",
                "",
            ].join("\n")
        );
        await writeBundleFile(
            path.join("proj", "databricks.yaml"),
            [
                "bundle: {name: child}",
                "targets: {dev: {default: true}}",
                "",
            ].join("\n")
        );
        const projectRoot = path.join(tmpdir.path, "proj");

        // The extension reads only the project folder: the host-less child.
        const extHost = extensionResolvedHost(
            await makeModel(projectRoot).getTargetWorkspaceFromDisk("dev")
        );
        expect(extHost).to.be.undefined;

        // Unpinned, the CLI walks up to the parent and would send the token there.
        expect(cliResolvedHost(projectRoot, "dev")).to.equal(
            "https://parent.invalid"
        );

        // Pinned to the project folder (what the extension does in remote mode),
        // the CLI reads the child and matches the extension — no parent host.
        const pinnedHost = cliResolvedHost(projectRoot, "dev", {
            pinnedRoot: projectRoot,
        });
        expect(pinnedHost).to.not.equal("https://parent.invalid");
        expect(pinnedHost).to.equal(extHost);
    });
});
