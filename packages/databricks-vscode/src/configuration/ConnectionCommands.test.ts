/* eslint-disable @typescript-eslint/naming-convention */
import {ApiClient} from "@databricks/sdk-experimental";
import {Cluster} from "../sdk-extensions";
import assert from "assert";
import {mock} from "ts-mockito";
import {QuickPickItem, window} from "vscode";
import {
    ConnectionCommands,
    formatClusterState,
    formatQuickPickClusterDetails,
} from "./ConnectionCommands";

/**
 * Scriptable stand-in for the compute QuickPick. The test drives
 * {@link accept}/{@link hide} explicitly, since the command registers its
 * handlers only after `show()`.
 */
class FakeComputeQuickPick {
    title?: string;
    keepScrollPosition = false;
    busy = false;
    canSelectMany = false;
    items: readonly QuickPickItem[] = [];
    selectedItems: readonly QuickPickItem[] = [];
    disposed = false;
    private readonly acceptCbs: Array<() => void | Promise<void>> = [];
    private readonly hideCbs: Array<() => void> = [];

    onDidAccept(cb: () => void | Promise<void>) {
        this.acceptCbs.push(cb);
        return {dispose() {}};
    }
    onDidHide(cb: () => void) {
        this.hideCbs.push(cb);
        return {dispose() {}};
    }
    show() {}
    dispose() {
        this.disposed = true;
    }

    /** Simulate the user picking `selected` and pressing Enter. */
    async accept(selected: readonly QuickPickItem[]) {
        this.selectedItems = selected;
        for (const cb of this.acceptCbs) {
            await cb();
        }
    }
    /** Simulate the user dismissing the picker (Escape). */
    async hide() {
        for (const cb of this.hideCbs) {
            cb();
        }
    }
}

describe(__filename, () => {
    it("attach cluster quickpick: correctly format cluster details", () => {
        const clusterDetails = formatQuickPickClusterDetails(
            new Cluster(mock(ApiClient), {
                cluster_id: "cluster-id-2",
                cluster_name: "cluster-name-2",
                creator_user_name: "user-2",
                state: "TERMINATED",
                cluster_memory_mb: 2048,
                cluster_cores: 4,
                spark_version: "spark-version",
            })
        );

        assert.equal(clusterDetails, `2 GB | 4 Cores | spark-version | user-2`);
    });

    it("formatClusterState: maps RUNNING/TERMINATED to Active/Inactive and title-cases the rest", () => {
        assert.equal(formatClusterState("RUNNING"), "Active");
        assert.equal(formatClusterState("TERMINATED"), "Inactive");
        assert.equal(formatClusterState("PENDING"), "Pending");
        assert.equal(formatClusterState("RESTARTING"), "Restarting");
        assert.equal(formatClusterState("TERMINATING"), "Terminating");
        assert.equal(formatClusterState("ERROR"), "Error");
        assert.equal(formatClusterState("UNKNOWN"), "Unknown");
    });

    describe("attachClusterQuickPick return contract", () => {
        let originalCreateQuickPick: typeof window.createQuickPick;
        let fakePick: FakeComputeQuickPick;
        let attachCalls: string[];
        let commands: ConnectionCommands;

        beforeEach(() => {
            originalCreateQuickPick = window.createQuickPick;
            fakePick = new FakeComputeQuickPick();
            (window as unknown as {createQuickPick: unknown}).createQuickPick =
                () => fakePick;

            attachCalls = [];
            const connectionManager = {
                workspaceClient: {},
                databricksWorkspace: {userName: "me"},
                attachCluster: async (id: string) => {
                    attachCalls.push(id);
                },
                enableServerless: async () => {},
            };
            const clusterModel = {
                refresh() {},
                onDidChange() {
                    return {dispose() {}};
                },
                roots: [],
            };
            commands = new ConnectionCommands(
                {} as never,
                connectionManager as never,
                clusterModel as never,
                {} as never,
                {} as never,
                {} as never
            );
        });

        afterEach(() => {
            (window as unknown as {createQuickPick: unknown}).createQuickPick =
                originalCreateQuickPick;
        });

        const clusterItem = (id: string) =>
            ({
                label: `cluster ${id}`,
                cluster: {id},
            }) as unknown as QuickPickItem;

        it("resolves to the attached cluster and attaches it exactly once", async () => {
            const resultP = commands.attachClusterQuickPickCommand()();
            await fakePick.accept([clusterItem("c1")]);

            assert.deepEqual(await resultP, {
                kind: "cluster",
                clusterId: "c1",
            });
            assert.deepEqual(attachCalls, ["c1"]);
        });

        it("resolves to undefined when the picker is dismissed", async () => {
            const resultP = commands.attachClusterQuickPickCommand()();
            await fakePick.hide();

            assert.equal(await resultP, undefined);
            assert.deepEqual(attachCalls, []);
        });

        it("guards re-entry: a second Enter neither re-attaches nor changes the result", async () => {
            // Without the `settled` guard a double Enter would attach twice.
            const resultP = commands.attachClusterQuickPickCommand()();
            await fakePick.accept([clusterItem("c1")]);
            await fakePick.accept([clusterItem("c2")]);

            assert.deepEqual(await resultP, {
                kind: "cluster",
                clusterId: "c1",
            });
            assert.deepEqual(attachCalls, ["c1"]);
        });

        it("resolves to undefined when accepted with nothing highlighted", async () => {
            const resultP = commands.attachClusterQuickPickCommand()();
            await fakePick.accept([]);

            assert.equal(await resultP, undefined);
            assert.deepEqual(attachCalls, []);
        });

        it("still returns the chosen cluster when the attach silently fails (best-effort)", async () => {
            // attachCluster is @onError(throw:false): a failed write resolves
            // without throwing, so we still return the picked target by design.
            const attach = async () => {};
            const cmds = new ConnectionCommands(
                {} as never,
                {
                    workspaceClient: {},
                    databricksWorkspace: {userName: "me"},
                    attachCluster: attach,
                    enableServerless: async () => {},
                } as never,
                {
                    refresh() {},
                    onDidChange() {
                        return {dispose() {}};
                    },
                    roots: [],
                } as never,
                {} as never,
                {} as never,
                {} as never
            );

            const resultP = cmds.attachClusterQuickPickCommand()();
            await fakePick.accept([clusterItem("c1")]);

            assert.deepEqual(await resultP, {
                kind: "cluster",
                clusterId: "c1",
            });
        });

        it("resolves to undefined if an unexpected error is thrown during selection", async () => {
            // A throw from any step must settle the Promise, not hang.
            const cmds = new ConnectionCommands(
                {} as never,
                {
                    workspaceClient: {},
                    databricksWorkspace: {userName: "me"},
                    attachCluster: async () => {
                        throw new Error("unexpected");
                    },
                    enableServerless: async () => {},
                } as never,
                {
                    refresh() {},
                    onDidChange() {
                        return {dispose() {}};
                    },
                    roots: [],
                } as never,
                {} as never,
                {} as never,
                {} as never
            );

            const resultP = cmds.attachClusterQuickPickCommand()();
            await fakePick.accept([clusterItem("c1")]);

            assert.equal(await resultP, undefined);
        });
    });
});
