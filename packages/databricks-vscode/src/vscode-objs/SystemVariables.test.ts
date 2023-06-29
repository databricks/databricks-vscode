import {SystemVariables} from "./SystemVariables";
import {expect} from "chai";
import path from "node:path";
import {Uri} from "vscode";

describe(__filename, () => {
    it("should correctly interpolate known variables", () => {
        const workspacePath = Uri.file("workspacePath");
        const systemVariables = new SystemVariables(workspacePath);
        const resolved = systemVariables.resolve(
            path.join("${workspaceRoot}", "test")
        );
        expect(resolved).to.equal(path.join(workspacePath.fsPath, "test"));

        systemVariables.resolve(path.join("${workspaceFolder}", "test"));
        expect(resolved).to.equal(path.join(workspacePath.fsPath, "test"));

        systemVariables.resolve(path.join("${cwd}", "test"));
        expect(resolved).to.equal(path.join(workspacePath.fsPath, "test"));
    });

    it("should not interpolate unknown variables", () => {
        const workspacePath = "workspacePath";
        const systemVariables = new SystemVariables(Uri.file(workspacePath));
        const resolved = systemVariables.resolve(
            path.join("${unknown}", "test")
        );
        expect(resolved).to.equal(path.join("${unknown}", "test"));
    });
});
