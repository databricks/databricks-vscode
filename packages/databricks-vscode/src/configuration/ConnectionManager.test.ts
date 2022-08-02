/* eslint-disable @typescript-eslint/naming-convention */

import {mock, instance} from "ts-mockito";
import {cluster} from "@databricks/databricks-sdk";
import {ConnectionManager} from "./ConnectionManager";
import {Disposable} from "vscode";
import {CliWrapper} from "../cli/CliWrapper";

const me = "user-1";
const mockListClustersResponse: cluster.ListClustersResponse = {
    clusters: [
        {
            cluster_id: "cluster-id-2",
            cluster_name: "cluster-name-2",
            cluster_source: "UI",
            creator_user_name: "user-2",
            state: "TERMINATED",
        },
        {
            cluster_id: "cluster-id-1",
            cluster_name: "cluster-name-1",
            cluster_source: "UI",
            creator_user_name: me,
            state: "RUNNING",
        },
        {
            cluster_id: "cluster-id-3",
            cluster_name: "cluster-name-3",
            cluster_source: "JOB",
            creator_user_name: "user-3",
            state: "RUNNING",
        },
    ],
};

describe(__filename, () => {
    let mockedCliWrapper: CliWrapper;
    let disposables: Array<Disposable>;

    beforeEach(() => {
        disposables = [];
        mockedCliWrapper = mock(CliWrapper);
    });

    afterEach(() => {
        disposables.forEach((d) => d.dispose());
    });

    it("should create an instance", async () => {
        let manager = new ConnectionManager(instance(mockedCliWrapper));
    });

    // login
    // logout
    // configure
    // attach cluster
    // detach cluster
    // attach workspace
    // detach workspace
});
