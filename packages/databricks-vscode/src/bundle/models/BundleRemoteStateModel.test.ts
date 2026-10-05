import assert from "assert";
import {Uri} from "vscode";
import {anything, instance, mock, verify, when} from "ts-mockito";
import {CliWrapper} from "../../cli/CliWrapper";
import {WorkspaceFolderManager} from "../../vscode-objs/WorkspaceFolderManager";
import {WorkspaceConfigs} from "../../vscode-objs/WorkspaceConfigs";
import {AuthProvider} from "../../configuration/auth/AuthProvider";
import {BundleRemoteStateModel} from "./BundleRemoteStateModel";

describe("BundleRemoteStateModel auth guard", () => {
    let mockCli: CliWrapper;

    function buildModel(allowed: boolean): BundleRemoteStateModel {
        mockCli = mock(CliWrapper);
        when(
            mockCli.bundleSummarise(
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
            async () => allowed
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
                anything()
            )
        ).never();
    });
});
