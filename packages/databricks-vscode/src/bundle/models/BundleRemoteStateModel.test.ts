import assert from "assert";
import {Uri} from "vscode";
import {anything, capture, instance, mock, verify, when} from "ts-mockito";
import {CliWrapper} from "../../cli/CliWrapper";
import {WorkspaceFolderManager} from "../../vscode-objs/WorkspaceFolderManager";
import {WorkspaceConfigs} from "../../vscode-objs/WorkspaceConfigs";
import {AuthProvider} from "../../configuration/auth/AuthProvider";
import {BundleRemoteStateModel} from "./BundleRemoteStateModel";

describe("BundleRemoteStateModel auth guard", () => {
    let mockCli: CliWrapper;

    // `remote` controls whether a credential guard is pinned. The guard is set
    // only in Remote SSH mode, so its presence is how the model knows to pin
    // DATABRICKS_BUNDLE_ROOT (pinBundleRoot) for the CLI.
    function buildModel(
        allowed: boolean,
        remote = true
    ): BundleRemoteStateModel {
        mockCli = mock(CliWrapper);
        when(
            mockCli.bundleSummarise(
                anything(),
                anything(),
                anything(),
                anything(),
                anything(),
                anything()
            )
        ).thenResolve({
            stdout: JSON.stringify({bundle: {name: "p"}}),
            stderr: "",
        });
        const model = new BundleRemoteStateModel(
            instance(mockCli),
            {
                activeProjectUri: Uri.file("/tmp/project"),
            } as unknown as WorkspaceFolderManager,
            {} as WorkspaceConfigs
        );
        model.setTarget("dev");
        model.setAuthProvider(
            {toJSON: () => ({})} as unknown as AuthProvider,
            remote
                ? async () =>
                      allowed
                          ? {allowed: true}
                          : {allowed: false, reason: "nope"}
                : undefined
        );
        return model;
    }

    it("reads the remote state when the guard allows the target", async () => {
        const model = buildModel(true);

        await model.refresh();

        assert.deepStrictEqual(await model.get("bundle"), {name: "p"});
    });

    it("skips `bundle summary` when the guard refuses the target", async () => {
        const model = buildModel(false);

        await model.refresh();

        assert.deepStrictEqual(await model.load(), {});
        verify(
            mockCli.bundleSummarise(
                anything(),
                anything(),
                anything(),
                anything(),
                anything(),
                anything()
            )
        ).never();
    });

    it("refuses to deploy when the guard refuses the target", async () => {
        const model = buildModel(false);

        await assert.rejects(model.deploy(), /paused/);
        verify(
            mockCli.bundleDeploy(
                anything(),
                anything(),
                anything(),
                anything(),
                anything(),
                anything(),
                anything(),
                anything()
            )
        ).never();
    });

    it("pins the bundle root to the project folder in remote mode", async () => {
        // With the guard set (Remote SSH), the CLI must resolve the same bundle
        // root the guard checked, so it can't walk up to a parent databricks.yml
        // with a different host. The model passes the snapshotted project root
        // and pinBundleRoot=true.
        const model = buildModel(true);

        await model.refresh();

        const [, , projectRoot, , , pinBundleRoot] = capture(
            mockCli.bundleSummarise
        ).last();
        assert.strictEqual(
            (projectRoot as Uri).fsPath,
            Uri.file("/tmp/project").fsPath
        );
        assert.strictEqual(pinBundleRoot, true);
    });

    it("does not pin the bundle root in normal mode (no guard)", async () => {
        // No credential guard means normal mode, where the CLI keeps its own
        // bundle-root resolution (no DATABRICKS_BUNDLE_ROOT), so behaviour is
        // unchanged.
        const model = buildModel(true, false);

        await model.refresh();

        const [, , , , , pinBundleRoot] = capture(
            mockCli.bundleSummarise
        ).last();
        assert.strictEqual(pinBundleRoot, false);
    });
});
