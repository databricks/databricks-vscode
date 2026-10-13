import assert from "assert";
import {Uri} from "vscode";
import {anything, capture, instance, mock, verify, when} from "ts-mockito";
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
                anything(),
                anything()
            )
        ).never();
    });

    it("pins the bundle root to the project folder in remote mode", async () => {
        // A credential guard means Remote SSH mode: the CLI must resolve the
        // same bundle root the guard checked, so the model passes the project
        // root and pinBundleRoot=true.
        const model = buildModel({bundle: {name: "proj"}});
        model.setAuthProvider(
            {toJSON: () => ({})} as unknown as AuthProvider,
            async () => ({allowed: true})
        );

        await model.load();

        const [, , projectRoot, , , pinBundleRoot] = capture(
            mockCli.bundleValidate
        ).last();
        assert.strictEqual(
            (projectRoot as Uri).fsPath,
            Uri.file("/tmp/project").fsPath
        );
        assert.strictEqual(pinBundleRoot, true);
    });
});
