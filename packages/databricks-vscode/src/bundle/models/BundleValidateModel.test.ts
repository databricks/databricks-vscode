import assert from "assert";
import {Uri} from "vscode";
import {anything, instance, mock, verify, when} from "ts-mockito";
import {CliWrapper} from "../../cli/CliWrapper";
import {BundleWatcher} from "../BundleWatcher";
import {WorkspaceFolderManager} from "../../vscode-objs/WorkspaceFolderManager";
import {AuthProvider} from "../../configuration/auth/AuthProvider";
import {BundleValidateModel} from "./BundleValidateModel";

describe("BundleValidateModel", () => {
    let mockCli: CliWrapper;

    function buildModel(validateStdout: object): BundleValidateModel {
        const fakeWatcher = {
            onDidChange: () => ({dispose() {}}),
        } as unknown as BundleWatcher;
        const fakeWorkspaceFolderManager = {
            activeProjectUri: Uri.file("/tmp/project"),
        } as unknown as WorkspaceFolderManager;
        mockCli = mock(CliWrapper);
        when(
            mockCli.bundleValidate(
                anything(),
                anything(),
                anything(),
                anything(),
                anything()
            )
        ).thenResolve({stdout: JSON.stringify(validateStdout), stderr: ""});

        const model = new BundleValidateModel(
            fakeWatcher,
            instance(mockCli),
            fakeWorkspaceFolderManager
        );
        model.setTarget("dev");
        model.setAuthProvider({
            toJSON: () => ({}),
        } as unknown as AuthProvider);
        return model;
    }

    it("skips the CLI when the auth guard refuses the target", async () => {
        const model = buildModel({bundle: {name: "proj"}});
        model.setAuthProvider(
            {toJSON: () => ({})} as unknown as AuthProvider,
            async () => ({allowed: false, reason: "nope"})
        );

        assert.deepStrictEqual(await model.load(), {});
        verify(
            mockCli.bundleValidate(
                anything(),
                anything(),
                anything(),
                anything(),
                anything()
            )
        ).never();
    });
});
