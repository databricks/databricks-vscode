import assert from "assert";
import {Uri} from "vscode";
import {anything, instance, mock, when} from "ts-mockito";
import {CliWrapper} from "../../cli/CliWrapper";
import {BundleWatcher} from "../BundleWatcher";
import {WorkspaceFolderManager} from "../../vscode-objs/WorkspaceFolderManager";
import {AuthProvider} from "../../configuration/auth/AuthProvider";
import {BundleValidateModel} from "./BundleValidateModel";

describe("BundleValidateModel", () => {
    function buildModel(validateStdout: object): BundleValidateModel {
        const fakeWatcher = {
            onDidChange: () => ({dispose() {}}),
        } as unknown as BundleWatcher;
        const fakeWorkspaceFolderManager = {
            activeProjectUri: Uri.file("/tmp/project"),
        } as unknown as WorkspaceFolderManager;
        const mockCli = mock(CliWrapper);
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

    it("reads bundle.engine off the validate output", async () => {
        const model = buildModel({
            bundle: {name: "proj", engine: "terraform"},
        });

        assert.strictEqual(await model.get("engine"), "terraform");
    });

    it("leaves engine undefined when the validate output omits it", async () => {
        const model = buildModel({
            bundle: {name: "proj"},
        });

        assert.strictEqual(await model.get("engine"), undefined);
    });
});
