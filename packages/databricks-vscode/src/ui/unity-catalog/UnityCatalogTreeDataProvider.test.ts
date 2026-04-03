/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {anything, instance, mock, when} from "ts-mockito";
import {Disposable} from "vscode";
import {WorkspaceClient} from "@databricks/sdk-experimental";
import {
    CatalogsService,
    FunctionsService,
    RegisteredModelsService,
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
    UnityCatalogTreeItem,
    UnityCatalogTreeNode,
} from "./UnityCatalogTreeDataProvider";
import {StateStorage} from "../../vscode-objs/StateStorage";

describe(__filename, () => {
    let disposables: Disposable[] = [];
    let mockConnectionManager: ConnectionManager;
    let stubStateStorage: StateStorage;
    let mockWorkspaceClient: WorkspaceClient;
    let mockCatalogs: CatalogsService;
    let mockSchemas: SchemasService;
    let mockTables: TablesService;
    let mockVolumes: VolumesService;
    let mockFunctions: FunctionsService;
    let mockRegisteredModels: RegisteredModelsService;
    let onDidChangeStateHandler: (s: ConnectionState) => void;

    beforeEach(() => {
        disposables = [];
        onDidChangeStateHandler = () => {};
        stubStateStorage = {
            get: () => [] as string[],
            set: async () => {},
            onDidChange: () => ({dispose() {}}),
        } as unknown as StateStorage;

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
                    data_source_format: "DELTA",
                    comment: "a test table",
                    owner: "alice",
                    columns: [
                        {
                            name: "id",
                            type_text: "bigint",
                            nullable: false,
                            position: 0,
                        },
                        {
                            name: "name",
                            type_text: "string",
                            nullable: true,
                            position: 1,
                        },
                    ],
                };
            }
            return impl();
        });

        mockVolumes = mock(VolumesService);
        when(mockVolumes.list(anything(), anything())).thenCall(() => {
            async function* impl() {
                yield {
                    name: "v1",
                    full_name: "cat.sch.v1",
                    volume_type: "MANAGED",
                };
            }
            return impl();
        });

        mockFunctions = mock(FunctionsService);
        when(mockFunctions.list(anything(), anything())).thenCall(() => {
            async function* impl() {
                yield {
                    name: "f1",
                    catalog_name: "cat",
                    schema_name: "sch",
                };
            }
            return impl();
        });

        mockRegisteredModels = mock(RegisteredModelsService);
        when(mockRegisteredModels.list(anything(), anything())).thenCall(() => {
            async function* impl() {
                /* empty */
            }
            return impl();
        });

        mockWorkspaceClient = mock(WorkspaceClient);
        when(mockWorkspaceClient.catalogs).thenReturn(instance(mockCatalogs));
        when(mockWorkspaceClient.schemas).thenReturn(instance(mockSchemas));
        when(mockWorkspaceClient.tables).thenReturn(instance(mockTables));
        when(mockWorkspaceClient.volumes).thenReturn(instance(mockVolumes));
        when(mockWorkspaceClient.functions).thenReturn(instance(mockFunctions));
        when(mockWorkspaceClient.registeredModels).thenReturn(
            instance(mockRegisteredModels)
        );

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
            instance(mockConnectionManager),
            stubStateStorage
        );
        disposables.push(provider);

        const children = await resolveProviderResult(provider.getChildren());
        assert.strictEqual(children, undefined);
    });

    it("lists catalogs sorted by name", async () => {
        const provider = new UnityCatalogTreeDataProvider(
            instance(mockConnectionManager),
            stubStateStorage
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
            instance(mockConnectionManager),
            stubStateStorage
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
        assert.strictEqual(
            (children[0] as {catalogName: string}).catalogName,
            "cat"
        );
    });

    it("lists tables, volumes, and functions under a schema", async () => {
        const provider = new UnityCatalogTreeDataProvider(
            instance(mockConnectionManager),
            stubStateStorage
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
        assert.strictEqual(children.length, 3);
        const kinds = children.map((c) => c.kind).sort();
        assert.deepStrictEqual(kinds, ["function", "table", "volume"]);

        const table = children.find((c) => c.kind === "table");
        assert(table && table.kind === "table");
        assert.strictEqual(table.name, "t1");

        const volume = children.find((c) => c.kind === "volume");
        assert(volume && volume.kind === "volume");
        assert.strictEqual(volume.name, "v1");

        const fn = children.find((c) => c.kind === "function");
        assert(fn && fn.kind === "function");
        assert.strictEqual(fn.name, "f1");
        assert.strictEqual(fn.fullName, "cat.sch.f1");
    });

    it("fires onDidChangeTreeData when connection state changes", async () => {
        const provider = new UnityCatalogTreeDataProvider(
            instance(mockConnectionManager),
            stubStateStorage
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

    it("getTreeItem sets url when host is available", async () => {
        const stubManager = {
            onDidChangeState: () => ({dispose() {}}),
            databricksWorkspace: {
                host: new URL("https://adb-123.azuredatabricks.net/"),
            },
        } as unknown as ConnectionManager;

        const provider = new UnityCatalogTreeDataProvider(stubManager, stubStateStorage);
        disposables.push(provider);

        const catalog: UnityCatalogTreeNode = {
            kind: "catalog",
            name: "cat",
            fullName: "cat",
        };
        const item = provider.getTreeItem(catalog) as UnityCatalogTreeItem;

        assert(item.url, "url should be set");
        assert(
            item.url!.includes("explore/data/cat"),
            `url should contain explore/data/cat, got: ${item.url}`
        );
        assert(
            item.contextValue?.endsWith(".has-url"),
            `contextValue should end with .has-url, got: ${item.contextValue}`
        );
        assert.strictEqual(item.copyText, "cat");
    });

    it("getTreeItem omits url when no host", async () => {
        const provider = new UnityCatalogTreeDataProvider(
            instance(mockConnectionManager),
            stubStateStorage
        );
        disposables.push(provider);

        const catalog: UnityCatalogTreeNode = {
            kind: "catalog",
            name: "cat",
            fullName: "cat",
        };
        const item = provider.getTreeItem(catalog) as UnityCatalogTreeItem;

        assert.strictEqual(item.url, undefined);
        assert.strictEqual(item.contextValue, "unityCatalog.catalog");
    });

    it("getTreeItem for function node", async () => {
        const provider = new UnityCatalogTreeDataProvider(
            instance(mockConnectionManager),
            stubStateStorage
        );
        disposables.push(provider);

        const fn: UnityCatalogTreeNode = {
            kind: "function",
            catalogName: "cat",
            schemaName: "sch",
            name: "f1",
            fullName: "cat.sch.f1",
        };
        const item = provider.getTreeItem(fn) as UnityCatalogTreeItem;

        assert.strictEqual(item.label, "f1");
        assert.strictEqual(item.copyText, "cat.sch.f1");
        assert(
            item.contextValue === "unityCatalog.function" ||
                item.contextValue === "unityCatalog.function.has-url"
        );
    });

    it("table node carries enriched fields", async () => {
        const provider = new UnityCatalogTreeDataProvider(
            instance(mockConnectionManager),
            stubStateStorage
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

        const table = children.find((c) => c.kind === "table");
        assert(table && table.kind === "table");
        assert.strictEqual(table.dataSourceFormat, "DELTA");
        assert.strictEqual(table.comment, "a test table");
        assert.strictEqual(table.owner, "alice");
        assert(table.columns && table.columns.length === 2);
        assert.strictEqual(table.columns[0].name, "id");
        assert.strictEqual(table.columns[0].typeText, "bigint");
        assert.strictEqual(table.columns[0].nullable, false);
    });

    it("getChildren for table with columns returns sorted column nodes", async () => {
        const provider = new UnityCatalogTreeDataProvider(
            instance(mockConnectionManager),
            stubStateStorage
        );
        disposables.push(provider);

        const tableNode: UnityCatalogTreeNode = {
            kind: "table",
            catalogName: "cat",
            schemaName: "sch",
            name: "t1",
            fullName: "cat.sch.t1",
            columns: [
                {name: "b_col", typeText: "string", position: 1},
                {name: "a_col", typeText: "bigint", position: 0},
            ],
        };
        const children = (await resolveProviderResult(
            provider.getChildren(tableNode)
        )) as UnityCatalogTreeNode[];

        assert(children);
        assert.strictEqual(children.length, 2);
        assert.strictEqual(children[0].kind, "column");
        if (children[0].kind === "column") {
            assert.strictEqual(children[0].name, "a_col");
        }
        assert.strictEqual(children[1].kind, "column");
        if (children[1].kind === "column") {
            assert.strictEqual(children[1].name, "b_col");
        }
    });

    it("getChildren for table without columns returns undefined", async () => {
        const provider = new UnityCatalogTreeDataProvider(
            instance(mockConnectionManager),
            stubStateStorage
        );
        disposables.push(provider);

        const tableNode: UnityCatalogTreeNode = {
            kind: "table",
            catalogName: "cat",
            schemaName: "sch",
            name: "t1",
            fullName: "cat.sch.t1",
            columns: [],
        };
        const children = await resolveProviderResult(
            provider.getChildren(tableNode)
        );
        assert.strictEqual(children, undefined);
    });

    it("getTreeItem for non-nullable column uses symbol-key icon", async () => {
        const provider = new UnityCatalogTreeDataProvider(
            instance(mockConnectionManager),
            stubStateStorage
        );
        disposables.push(provider);

        const col: UnityCatalogTreeNode = {
            kind: "column",
            tableFullName: "cat.sch.t1",
            name: "id",
            typeText: "bigint",
            nullable: false,
        };
        const item = provider.getTreeItem(col) as UnityCatalogTreeItem;
        assert.strictEqual(item.label, "id");
        assert.strictEqual(item.description, "bigint");
        const icon = item.iconPath as {id: string};
        assert.strictEqual(icon.id, "symbol-key");
    });

    it("getTreeItem for nullable column uses symbol-field icon", async () => {
        const provider = new UnityCatalogTreeDataProvider(
            instance(mockConnectionManager),
            stubStateStorage
        );
        disposables.push(provider);

        const col: UnityCatalogTreeNode = {
            kind: "column",
            tableFullName: "cat.sch.t1",
            name: "val",
            typeText: "string",
            nullable: true,
        };
        const item = provider.getTreeItem(col) as UnityCatalogTreeItem;
        const icon = item.iconPath as {id: string};
        assert.strictEqual(icon.id, "symbol-field");
    });

    it("getTreeItem for EXTERNAL table with storage has has-storage in contextValue", async () => {
        const provider = new UnityCatalogTreeDataProvider(
            instance(mockConnectionManager),
            stubStateStorage
        );
        disposables.push(provider);

        const tableNode: UnityCatalogTreeNode = {
            kind: "table",
            catalogName: "cat",
            schemaName: "sch",
            name: "ext",
            fullName: "cat.sch.ext",
            tableType: "EXTERNAL",
            storageLocation: "s3://bucket/path",
        };
        const item = provider.getTreeItem(tableNode) as UnityCatalogTreeItem;
        assert(
            item.contextValue?.includes("has-storage"),
            `expected has-storage in contextValue, got: ${item.contextValue}`
        );
        assert.strictEqual(item.storageLocation, "s3://bucket/path");
    });

    it("getTreeItem for VIEW table with view_definition has is-view in contextValue", async () => {
        const provider = new UnityCatalogTreeDataProvider(
            instance(mockConnectionManager),
            stubStateStorage
        );
        disposables.push(provider);

        const tableNode: UnityCatalogTreeNode = {
            kind: "table",
            catalogName: "cat",
            schemaName: "sch",
            name: "vw",
            fullName: "cat.sch.vw",
            tableType: "VIEW",
            viewDefinition: "SELECT 1",
        };
        const item = provider.getTreeItem(tableNode) as UnityCatalogTreeItem;
        assert(
            item.contextValue?.includes("is-view"),
            `expected is-view in contextValue, got: ${item.contextValue}`
        );
        assert.strictEqual(item.viewDefinition, "SELECT 1");
    });

    it("volume node carries volumeType and shows EXTERNAL label suffix", async () => {
        const provider = new UnityCatalogTreeDataProvider(
            instance(mockConnectionManager),
            stubStateStorage
        );
        disposables.push(provider);

        const volNode: UnityCatalogTreeNode = {
            kind: "volume",
            catalogName: "cat",
            schemaName: "sch",
            name: "ev",
            fullName: "cat.sch.ev",
            volumeType: "EXTERNAL",
            storageLocation: "s3://bucket/vol",
        };
        const item = provider.getTreeItem(volNode) as UnityCatalogTreeItem;
        assert.strictEqual(item.label, "ev (EXTERNAL)");
        assert(
            item.contextValue?.includes("has-storage"),
            `expected has-storage in contextValue, got: ${item.contextValue}`
        );
    });

    it("catalog node carries comment", async () => {
        const provider = new UnityCatalogTreeDataProvider(
            instance(mockConnectionManager),
            stubStateStorage
        );
        disposables.push(provider);

        const catNode: UnityCatalogTreeNode = {
            kind: "catalog",
            name: "cat",
            fullName: "cat",
            comment: "my catalog",
        };
        const item = provider.getTreeItem(catNode) as UnityCatalogTreeItem;
        assert.strictEqual(item.label, "cat");
    });

    it("returns error when functions API throws", async () => {
        when(mockFunctions.list(anything(), anything())).thenThrow(
            new Error("functions API unavailable")
        );

        const provider = new UnityCatalogTreeDataProvider(
            instance(mockConnectionManager),
            stubStateStorage
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
        // allSettled: tables (t1) and volumes (v1) still succeed; only functions errors
        assert.strictEqual(children.length, 3);
        assert.notStrictEqual(children[0].kind, "error");
        assert.strictEqual(children[children.length - 1].kind, "error");
    });
});
