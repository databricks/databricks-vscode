import {EventEmitter, Uri, WorkspaceFolder} from "vscode";
import {expect} from "chai";
import path from "path";
import * as tmp from "tmp-promise";
import * as fs from "fs/promises";
import {instance, mock, when} from "ts-mockito";
import {BundleFileSet} from "../BundleFileSet";
import {BundleWatcher} from "../BundleWatcher";
import {BundlePreValidateModel} from "./BundlePreValidateModel";
import {WorkspaceFolderManager} from "../../vscode-objs/WorkspaceFolderManager";

const SESSION_HOST = "https://session-host.example.com";
const OTHER_HOST = "https://other-workspace.example.com";

describe("BundlePreValidateModel", async function () {
    let tmpdir: tmp.DirectoryResult;

    beforeEach(async () => {
        tmpdir = await tmp.dir({unsafeCleanup: true});
    });

    afterEach(async () => {
        await tmpdir.cleanup();
    });

    function makeModel() {
        const workspaceFolderManager = mock<WorkspaceFolderManager>();
        const workspaceFolder = mock<WorkspaceFolder>();
        const uri = Uri.file(tmpdir.path);
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

    async function writeRoot(lines: string[]) {
        await fs.writeFile(
            path.join(tmpdir.path, "databricks.yml"),
            lines.join("\n") + "\n"
        );
    }

    // The method returns a union; narrow to the object form for host/profile
    // assertions.
    function asObject(
        ws: {host?: string; profile?: string} | string | undefined
    ): {host?: string; profile?: string} {
        expect(ws, "expected an object workspace, not a string").to.be.an(
            "object"
        );
        return ws as {host?: string; profile?: string};
    }

    it("getTargetWorkspaceFromDisk reads the host fresh from disk, not the cache", async () => {
        await writeRoot([
            "targets:",
            "  dev:",
            "    default: true",
            "    workspace:",
            `      host: ${SESSION_HOST}`,
        ]);
        const model = makeModel();

        // Prime the cache through the cached path (what the views read).
        expect((await model.targets)?.dev?.workspace?.host).to.equal(
            SESSION_HOST
        );

        // Change the host on disk without firing a BundleWatcher event, as a
        // missed inotify event or a `git pull` race would.
        await writeRoot([
            "targets:",
            "  dev:",
            "    default: true",
            "    workspace:",
            `      host: ${OTHER_HOST}`,
        ]);

        // The cached view is still stale...
        expect((await model.targets)?.dev?.workspace?.host).to.equal(
            SESSION_HOST
        );
        // ...but the guard's path reads the new host from disk.
        expect(
            asObject(await model.getTargetWorkspaceFromDisk("dev")).host
        ).to.equal(OTHER_HOST);
    });

    it("getTargetWorkspaceFromDisk sees a host set only in a dotfile include (matches the CLI)", async () => {
        await writeRoot([
            "bundle:",
            "  name: p",
            'include: ["targets/*.yml"]',
            "targets:",
            "  prod:",
            "    default: true",
        ]);
        await fs.mkdir(path.join(tmpdir.path, "targets"));
        await fs.writeFile(
            path.join(tmpdir.path, "targets", ".prod.yml"),
            [
                "targets:",
                "  prod:",
                "    workspace:",
                `      host: ${OTHER_HOST}`,
                "",
            ].join("\n")
        );

        expect(
            asObject(await makeModel().getTargetWorkspaceFromDisk("prod")).host
        ).to.equal(OTHER_HOST);
    });

    it("getTargetWorkspaceFromDisk inherits the top-level workspace.host", async () => {
        await writeRoot([
            "workspace:",
            `  host: ${SESSION_HOST}`,
            "targets:",
            "  dev:",
            "    default: true",
        ]);

        expect(
            asObject(await makeModel().getTargetWorkspaceFromDisk("dev")).host
        ).to.equal(SESSION_HOST);
    });

    it("getTargetWorkspaceFromDisk reports a target's workspace.profile", async () => {
        // A profile picks its own host (overriding DATABRICKS_HOST) and the CLI
        // doesn't report the resolved host, so the guard must see the profile
        // and fail closed. Confirmed to divert the session token to the
        // profile's workspace against CLI v1.19.0.
        await writeRoot([
            "targets:",
            "  dev:",
            "    default: true",
            "    workspace:",
            "      profile: some-other-workspace",
        ]);

        const ws = asObject(
            await makeModel().getTargetWorkspaceFromDisk("dev")
        );
        expect(ws.profile).to.equal("some-other-workspace");
        expect(ws.host).to.be.undefined;
    });

    it("getTargetWorkspaceFromDisk surfaces a whole workspace block given as a variable", async () => {
        await writeRoot([
            "targets:",
            "  dev:",
            "    default: true",
            "    workspace: ${var.ws}",
        ]);

        expect(await makeModel().getTargetWorkspaceFromDisk("dev")).to.equal(
            "${var.ws}"
        );
    });

    it("getTargetWorkspaceFromDisk returns no host for a target without one", async () => {
        await writeRoot(["targets:", "  dev:", "    default: true"]);

        const ws = asObject(
            await makeModel().getTargetWorkspaceFromDisk("dev")
        );
        expect(ws.host).to.be.undefined;
        expect(ws.profile).to.be.undefined;
    });

    it("getWorkspaceAuthFileCounts counts a host set in more than one file (Repro B)", async () => {
        // Top-level workspace.host in databricks.yml plus a target host in an
        // included file: two files set the host. The CLI's last-file-wins merge
        // decides which host the session token reaches, so the guard fails
        // closed rather than trust our file order matches the CLI's.
        await writeRoot([
            "bundle:",
            "  name: p",
            'include: ["targets/*.yml"]',
            "workspace:",
            `  host: ${OTHER_HOST}`,
            "targets:",
            "  dev:",
            "    default: true",
        ]);
        await fs.mkdir(path.join(tmpdir.path, "targets"));
        await fs.writeFile(
            path.join(tmpdir.path, "targets", "a.yml"),
            [
                "targets:",
                "  dev:",
                "    workspace:",
                `      host: ${SESSION_HOST}`,
                "",
            ].join("\n")
        );

        const counts = await makeModel().getWorkspaceAuthFileCounts("dev");
        expect(counts.hostFiles).to.equal(2);
        expect(counts.profileFiles).to.equal(0);
    });

    it("getWorkspaceAuthFileCounts counts a host set in a single file once", async () => {
        await writeRoot([
            "targets:",
            "  dev:",
            "    default: true",
            "    workspace:",
            `      host: ${SESSION_HOST}`,
        ]);

        const counts = await makeModel().getWorkspaceAuthFileCounts("dev");
        expect(counts.hostFiles).to.equal(1);
        expect(counts.profileFiles).to.equal(0);
    });

    it("getWorkspaceAuthFileCounts counts a profile set in more than one file", async () => {
        await writeRoot([
            "bundle:",
            "  name: p",
            'include: ["targets/*.yml"]',
            "workspace:",
            "  profile: root-profile",
            "targets:",
            "  dev:",
            "    default: true",
        ]);
        await fs.mkdir(path.join(tmpdir.path, "targets"));
        await fs.writeFile(
            path.join(tmpdir.path, "targets", "a.yml"),
            [
                "targets:",
                "  dev:",
                "    workspace:",
                "      profile: target-profile",
                "",
            ].join("\n")
        );

        const counts = await makeModel().getWorkspaceAuthFileCounts("dev");
        expect(counts.profileFiles).to.equal(2);
    });
});
