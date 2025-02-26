/* eslint-disable @typescript-eslint/naming-convention */
import assert from "assert";
import {Uri} from "vscode";
import {ProfileAuthProvider} from "./auth/AuthProvider";
import {DatabricksWorkspace} from "./DatabricksWorkspace";
import {iam} from "@databricks/databricks-sdk";
import {instance, mock} from "ts-mockito";
import {CliWrapper} from "../cli/CliWrapper";

describe(__filename, () => {
    it("create an instance", () => {
        const host = Uri.parse("https://fabian.databricks.com");
        const user: iam.User = {
            userName: "fabian@databricks.com",
        };
        const wsConf = {
            enableProjectTypeInWorkspace: "true",
            enableWorkspaceFilesystem: "dbr11.0+",
        } as const;
        const authProvider = new ProfileAuthProvider(
            new URL("https://fabian.databricks.com"),
            "DEFAULT",
            instance(mock(CliWrapper))
        );
        const dbWorkspace: DatabricksWorkspace = new DatabricksWorkspace(
            "workspace-id",
            authProvider,
            user,
            wsConf
        );

        assert(dbWorkspace.host.toString() === host.toString());
        assert.equal(dbWorkspace.userName, user.userName);
        assert.equal(dbWorkspace.id, "workspace-id");
        assert(dbWorkspace.isFilesInReposEnabled);
        assert(dbWorkspace.isFilesInReposEnabled);

        assert(
            dbWorkspace.supportFilesInReposForCluster({
                dbrVersion: [11, 4, 0],
            } as any)
        );
        assert(
            !dbWorkspace.supportFilesInReposForCluster({
                dbrVersion: [8, 3, 0],
            } as any)
        );
    });
});
