/* eslint-disable @typescript-eslint/naming-convention */
import {scim} from "@databricks/databricks-sdk";
import assert from "assert";
import {Uri} from "vscode";
import {DatabricksWorkspace} from "./DatabricksWorkspace";

describe(__filename, () => {
    it("create an instance", () => {
        const host = Uri.parse("https://fabian.databricks.com");
        const user: scim.User = {
            userName: "fabian@databricks.com",
        };
        const wsConf = {
            enableProjectTypeInWorkspace: "true",
            enableWorkspaceFilesystem: "dbr11.0+",
        } as const;
        const profile = "DEFAULT";
        const dbWorkspace: DatabricksWorkspace = new DatabricksWorkspace(
            host,
            user,
            wsConf,
            profile
        );

        assert(dbWorkspace.host.toString() === host.toString());
        assert.equal(dbWorkspace.userName, user.userName);
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
