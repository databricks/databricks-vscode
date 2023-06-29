import {SystemVariables} from "./SystemVariables";
import {expect} from "chai";
import {Uri} from "vscode";

describe(__filename, () => {
    it("should correctly interpolate known variables", () => {
        const workspacePath = "workspacePath";
        const systemVariables = new SystemVariables(Uri.file(workspacePath));
        const resolved = systemVariables.resolve("${workspaceRoot}/test");
        expect(resolved).to.equal(`/${workspacePath}/test`);

        systemVariables.resolve("${workspaceFolder}/test");
        expect(resolved).to.equal(`/${workspacePath}/test`);

        systemVariables.resolve("${cwd}/test");
        expect(resolved).to.equal(`/${workspacePath}/test`);
    });

    it("should not interpolate unknown variables", () => {
        const workspacePath = "workspacePath";
        const systemVariables = new SystemVariables(Uri.file(workspacePath));
        const resolved = systemVariables.resolve("${unknown}/test");
        expect(resolved).to.equal("${unknown}/test");
    });
});
