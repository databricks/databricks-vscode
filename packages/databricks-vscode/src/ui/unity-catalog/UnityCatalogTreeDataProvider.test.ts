/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {anything, instance, mock, when} from "ts-mockito";
import {Disposable} from "vscode";
import {WorkspaceClient} from "@databricks/sdk-experimental";
import {
    CatalogsService,
    SchemasService,
    TablesService,
    VolumesService,
} from "@databricks/sdk-experimental/dist/apis/catalog/api";
import {
    ConnectionManager,
    ConnectionState,
} from "../../configuration/ConnectionManager";
import {resolveProviderResult} from "../../test/utils";
import {
    UnityCatalogTreeDataProvider,
    UnityCatalogTreeNode,
} from "./UnityCatalogTreeDataProvider";

describe(__filename, () => {
    let disposables: Disposable[] = [];
    let mockConnectionManager: ConnectionManager;
    let mockWorkspaceClient: WorkspaceClient;
    let mockCatalogs: CatalogsService;
    let mockSchemas: SchemasService;
    let mockTables: TablesService;
    let mockVolumes: VolumesService;
    let onDidChangeStateHandler: (s: ConnectionState) => void;

    beforeEach(() => {
        disposables = [];
        onDidChangeStateHandler = () => {};

        mockCatalogs = mock(CatalogsService);
        when(mockCatalogs.list(anything(), anything())).thenCall(() => {
            async function* impl() {
                yield {name: "c_b", full_name: "c_b"};
                yield {name: "c_a", full_name: "c_a"};
            }
            return impl();
        });

        mockSchemas = mock(SchemasService);
        when(mockSchemas.list(anything(), anything())).thenCall(() => {
            async function* impl() {
                yield {name: "s_b", full_name: "cat.s_b"};
                yield {name: "s_a", full_name: "cat.s_a"};
            }
            return impl();
        });

        mockTables = mock(TablesService);
        when(mockTables.list(anything(), anything())).thenCall(() => {
            async function* impl() {
                yield {
                    name: "t1",
                    full_name: "cat.sch.t1",
                    table_type: "MANAGED",
                };
            }
            return impl();
        });

        mockVolumes = mock(VolumesService);
        when(mockVolumes.list(anything(), anything())).thenCall(() => {
            async function* impl() {
                yield {name: "v1", full_name: "cat.sch.v1"};
            }
            return impl();
        });

        mockWorkspaceClient = mock(WorkspaceClient);
        when(mockWorkspaceClient.catalogs).thenReturn(instance(mockCatalogs));
        when(mockWorkspaceClient.schemas).thenReturn(instance(mockSchemas));
        when(mockWorkspaceClient.tables).thenReturn(instance(mockTables));
        when(mockWorkspaceClient.volumes).thenReturn(instance(mockVolumes));

        mockConnectionManager = mock(ConnectionManager);
        when(mockConnectionManager.workspaceClient).thenReturn(
            instance(mockWorkspaceClient)
        );
        when(mockConnectionManager.onDidChangeState).thenReturn(
            (cb: (s: ConnectionState) => void) => {
                onDidChangeStateHandler = cb;
                return {dispose() {}};
            }
        );
    });

    afterEach(() => {
        disposables.forEach((d) => d.dispose());
    });

    it("returns undefined when not connected", async () => {
        when(mockConnectionManager.workspaceClient).thenReturn(undefined);
        const provider = new UnityCatalogTreeDataProvider(
            instance(mockConnectionManager)
        );
        disposables.push(provider);

        const children = await resolveProviderResult(provider.getChildren());
        assert.strictEqual(children, undefined);
    });

    it("lists catalogs sorted by name", async () => {
        const provider = new UnityCatalogTreeDataProvider(
            instance(mockConnectionManager)
        );
        disposables.push(provider);

        const children = (await resolveProviderResult(
            provider.getChildren()
        )) as UnityCatalogTreeNode[];
        assert(children);
        assert.strictEqual(children.length, 2);
        const first = children[0];
        const second = children[1];
        assert.strictEqual(first.kind, "catalog");
        assert.strictEqual(second.kind, "catalog");
        if (first.kind !== "catalog" || second.kind !== "catalog") {
            assert.fail("expected catalogs");
        }
        assert.strictEqual(first.name, "c_a");
        assert.strictEqual(second.name, "c_b");
    });

    it("lists schemas under a catalog", async () => {
        const provider = new UnityCatalogTreeDataProvider(
            instance(mockConnectionManager)
        );
        disposables.push(provider);

        const catalog: UnityCatalogTreeNode = {
            kind: "catalog",
            name: "cat",
            fullName: "cat",
        };
        const children = (await resolveProviderResult(
            provider.getChildren(catalog)
        )) as UnityCatalogTreeNode[];

        assert(children);
        assert.strictEqual(children.length, 2);
        assert.strictEqual(children[0].kind, "schema");
        assert.strictEqual(children[0].name, "s_a");
        assert.strictEqual((children[0] as {catalogName: string}).catalogName, "cat");
    });

    it("lists tables and volumes under a schema", async () => {
        const provider = new UnityCatalogTreeDataProvider(
            instance(mockConnectionManager)
        );
        disposables.push(provider);

        const schema: UnityCatalogTreeNode = {
            kind: "schema",
            catalogName: "cat",
            name: "sch",
            fullName: "cat.sch",
        };
        const children = (await resolveProviderResult(
            provider.getChildren(schema)
        )) as UnityCatalogTreeNode[];

        assert(children);
        assert.strictEqual(children.length, 2);
        const kinds = children.map((c) => c.kind).sort();
        assert.deepStrictEqual(kinds, ["table", "volume"]);
        const table = children.find((c) => c.kind === "table");
        assert(table && table.kind === "table");
        assert.strictEqual(table.name, "t1");
        const volume = children.find((c) => c.kind === "volume");
        assert(volume && volume.kind === "volume");
        assert.strictEqual(volume.name, "v1");
    });

    it("fires onDidChangeTreeData when connection state changes", async () => {
        const provider = new UnityCatalogTreeDataProvider(
            instance(mockConnectionManager)
        );
        disposables.push(provider);

        let count = 0;
        disposables.push(
            provider.onDidChangeTreeData(() => {
                count += 1;
            })
        );

        assert.strictEqual(count, 0);
        onDidChangeStateHandler("CONNECTED");
        assert.strictEqual(count, 1);
    });
});
