/* eslint-disable @typescript-eslint/naming-convention */

import assert from "assert";
import {anything, instance, mock, when} from "ts-mockito";
import {Disposable} from "vscode";
import {WorkspaceClient} from "@databricks/sdk-experimental";
import {
    CatalogsService,
    FunctionsService,
    ModelVersionsService,
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
    let mockModelVersions: ModelVersionsService;
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
        when(mockCatalogs.list(anything())).thenCall(() => {
            async function* impl() {
                yield {name: "c_b", full_name: "c_b"};
                yield {name: "c_a", full_name: "c_a"};
            }
            return impl();
        });

        mockSchemas = mock(SchemasService);
        when(mockSchemas.list(anything())).thenCall(() => {
            async function* impl() {
                yield {name: "s_b", full_name: "cat.s_b"};
                yield {name: "s_a", full_name: "cat.s_a"};
            }
            return impl();
        });

        mockTables = mock(TablesService);
        when(mockTables.list(anything())).thenCall(() => {
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
        when(mockVolumes.list(anything())).thenCall(() => {
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
        when(mockFunctions.list(anything())).thenCall(() => {
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
        when(mockRegisteredModels.list(anything())).thenCall(() => {
            async function* impl() {
                /* empty */
            }
            return impl();
        });

        mockModelVersions = mock(ModelVersionsService);
        when(mockModelVersions.list(anything())).thenCall(() => {
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
        when(mockWorkspaceClient.modelVersions).thenReturn(
            instance(mockModelVersions)
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
        const groups = (await resolveProviderResult(
            provider.getChildren(schema)
        )) as UnityCatalogTreeNode[];

        assert(groups);
        assert.strictEqual(groups.length, 3);
        assert(groups.every((g) => g.kind === "group"));
        const groupTypes = groups
            .map(
                (g) =>
                    (g as Extract<UnityCatalogTreeNode, {kind: "group"}>)
                        .groupType
            )
            .sort();
        assert.deepStrictEqual(groupTypes, ["functions", "tables", "volumes"]);

        // Expand the tables group
        const tablesGroup = groups.find(
            (g) => g.kind === "group" && (g as any).groupType === "tables"
        ) as UnityCatalogTreeNode;
        const tableChildren = (await resolveProviderResult(
            provider.getChildren(tablesGroup)
        )) as UnityCatalogTreeNode[];
        assert(tableChildren && tableChildren.length === 1);
        assert(tableChildren[0].kind === "table");
        assert.strictEqual((tableChildren[0] as any).name, "t1");

        // Expand the volumes group
        const volumesGroup = groups.find(
            (g) => g.kind === "group" && (g as any).groupType === "volumes"
        ) as UnityCatalogTreeNode;
        const volumeChildren = (await resolveProviderResult(
            provider.getChildren(volumesGroup)
        )) as UnityCatalogTreeNode[];
        assert(volumeChildren && volumeChildren.length === 1);
        assert(volumeChildren[0].kind === "volume");
        assert.strictEqual((volumeChildren[0] as any).name, "v1");

        // Expand the functions group
        const functionsGroup = groups.find(
            (g) => g.kind === "group" && (g as any).groupType === "functions"
        ) as UnityCatalogTreeNode;
        const fnChildren = (await resolveProviderResult(
            provider.getChildren(functionsGroup)
        )) as UnityCatalogTreeNode[];
        assert(fnChildren && fnChildren.length === 1);
        assert(fnChildren[0].kind === "function");
        assert.strictEqual((fnChildren[0] as any).name, "f1");
        assert.strictEqual((fnChildren[0] as any).fullName, "cat.sch.f1");
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

        const provider = new UnityCatalogTreeDataProvider(
            stubManager,
            stubStateStorage
        );
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
        const groups = (await resolveProviderResult(
            provider.getChildren(schema)
        )) as UnityCatalogTreeNode[];

        const tablesGroup = groups.find(
            (g) => g.kind === "group" && (g as any).groupType === "tables"
        ) as UnityCatalogTreeNode;
        assert(tablesGroup, "expected a tables group");
        const tableChildren = (await resolveProviderResult(
            provider.getChildren(tablesGroup)
        )) as UnityCatalogTreeNode[];

        const table = tableChildren.find((c) => c.kind === "table");
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
        when(mockFunctions.list(anything())).thenCall(() => {
            async function* impl(): AsyncGenerator<never> {
                throw new Error("functions API unavailable");
                // eslint-disable-next-line no-unreachable
                yield undefined as never;
            }
            return impl();
        });

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
        // allSettled: tables (t1) and volumes (v1) succeed; functions errors
        // groups appear first, error node surfaces at schema level
        const groupNodes = children.filter((c) => c.kind === "group");
        const errorNodes = children.filter((c) => c.kind === "error");
        assert.strictEqual(groupNodes.length, 2); // tables, volumes
        assert.strictEqual(errorNodes.length, 1);
    });

    it("lists registered models under a schema", async () => {
        when(mockRegisteredModels.list(anything())).thenCall(() => {
            async function* impl() {
                yield {name: "m1", full_name: "cat.sch.m1"};
            }
            return impl();
        });
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
        const groups = (await resolveProviderResult(
            provider.getChildren(schema)
        )) as UnityCatalogTreeNode[];

        const modelsGroup = groups.find(
            (g) => g.kind === "group" && (g as any).groupType === "models"
        ) as UnityCatalogTreeNode;
        assert(modelsGroup, "expected a models group");
        const modelChildren = (await resolveProviderResult(
            provider.getChildren(modelsGroup)
        )) as UnityCatalogTreeNode[];

        const model = modelChildren.find((c) => c.kind === "registeredModel");
        assert(model && model.kind === "registeredModel");
        assert.strictEqual(model.name, "m1");
        assert.strictEqual(model.fullName, "cat.sch.m1");
    });

    it("lists model versions for a registered model, sorted descending", async () => {
        when(mockModelVersions.list(anything())).thenCall(() => {
            async function* impl() {
                yield {version: 1};
                yield {version: 3};
                yield {version: 2};
            }
            return impl();
        });
        const provider = new UnityCatalogTreeDataProvider(
            instance(mockConnectionManager),
            stubStateStorage
        );
        disposables.push(provider);
        const modelNode: UnityCatalogTreeNode = {
            kind: "registeredModel",
            catalogName: "cat",
            schemaName: "sch",
            name: "m1",
            fullName: "cat.sch.m1",
        };
        const children = (await resolveProviderResult(
            provider.getChildren(modelNode)
        )) as UnityCatalogTreeNode[];
        assert(children);
        assert.strictEqual(children.length, 3);
        assert.strictEqual(children[0].kind, "modelVersion");
        if (children[0].kind === "modelVersion") {
            assert.strictEqual(children[0].version, 3);
            assert.strictEqual((children[2] as any).version, 1);
        }
    });

    it("pin adds schema to favorites and fires tree change", async () => {
        const storageMap = new Map<string, unknown>([
            ["databricks.unityCatalog.favorites", []],
        ]);
        const spyStorage = {
            get: (key: string) => storageMap.get(key) ?? [],
            set: async (key: string, val: unknown) => {
                storageMap.set(key, val);
            },
            onDidChange: () => ({dispose() {}}),
        } as unknown as StateStorage;
        const p = new UnityCatalogTreeDataProvider(
            instance(mockConnectionManager),
            spyStorage
        );
        disposables.push(p);
        let fired = 0;
        disposables.push(
            p.onDidChangeTreeData(() => {
                fired++;
            })
        );
        const schema = {
            kind: "schema" as const,
            catalogName: "cat",
            name: "sch",
            fullName: "cat.sch",
        };
        await p.pin(schema);
        assert(
            (storageMap.get("databricks.unityCatalog.favorites") as any[]).some(
                (f) => f.fullName === "cat.sch"
            )
        );
        assert.strictEqual(fired, 1);
    });

    it("unpin removes schema from favorites and fires tree change", async () => {
        const storageMap = new Map<string, unknown>([
            [
                "databricks.unityCatalog.favorites",
                [
                    {
                        kind: "schema",
                        catalogName: "cat",
                        name: "sch",
                        fullName: "cat.sch",
                    },
                    {
                        kind: "schema",
                        catalogName: "cat",
                        name: "other",
                        fullName: "cat.other",
                    },
                ],
            ],
        ]);
        const spyStorage = {
            get: (key: string) => storageMap.get(key) ?? [],
            set: async (key: string, val: unknown) => {
                storageMap.set(key, val);
            },
            onDidChange: () => ({dispose() {}}),
        } as unknown as StateStorage;
        const p = new UnityCatalogTreeDataProvider(
            instance(mockConnectionManager),
            spyStorage
        );
        disposables.push(p);
        let fired = 0;
        disposables.push(
            p.onDidChangeTreeData(() => {
                fired++;
            })
        );
        const schema = {
            kind: "schema" as const,
            catalogName: "cat",
            name: "sch",
            fullName: "cat.sch",
        };
        await p.unpin(schema);
        const favorites = storageMap.get(
            "databricks.unityCatalog.favorites"
        ) as any[];
        assert(!favorites.some((f) => f.fullName === "cat.sch"));
        assert(favorites.some((f) => f.fullName === "cat.other"));
        assert(fired >= 1);
    });

    it("group getChildren returns cached members for that type", async () => {
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
        // Populate the cache by loading schema children first
        await resolveProviderResult(provider.getChildren(schema));

        const tablesGroup: UnityCatalogTreeNode = {
            kind: "group",
            groupType: "tables",
            catalogName: "cat",
            schemaName: "sch",
            schemaFullName: "cat.sch",
            count: 1,
        };
        const tableChildren = (await resolveProviderResult(
            provider.getChildren(tablesGroup)
        )) as UnityCatalogTreeNode[];

        assert(tableChildren);
        assert.strictEqual(tableChildren.length, 1);
        assert.strictEqual(tableChildren[0].kind, "table");
        assert.strictEqual((tableChildren[0] as any).name, "t1");
    });

    it("groups with zero members are omitted", async () => {
        // No registered models → models group should not appear
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
        const groups = (await resolveProviderResult(
            provider.getChildren(schema)
        )) as UnityCatalogTreeNode[];

        assert(groups);
        const groupTypes = groups
            .filter((g) => g.kind === "group")
            .map((g) => (g as any).groupType);
        assert(
            !groupTypes.includes("models"),
            "models group should be absent when no models exist"
        );
        assert(groupTypes.includes("tables"));
        assert(groupTypes.includes("volumes"));
        assert(groupTypes.includes("functions"));
    });

    it("no grouping when schema has only one type of child", async () => {
        // Only tables, no volumes or functions
        when(mockVolumes.list(anything())).thenCall(() => {
            async function* impl() {
                /* empty */
            }
            return impl();
        });
        when(mockFunctions.list(anything())).thenCall(() => {
            async function* impl() {
                /* empty */
            }
            return impl();
        });

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
        assert(
            children.every((c) => c.kind !== "group"),
            "should not return group nodes when only one type present"
        );
        assert.strictEqual(children.length, 1);
        assert.strictEqual(children[0].kind, "table");
    });

    it("group node label includes child count", async () => {
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
        const groups = (await resolveProviderResult(
            provider.getChildren(schema)
        )) as UnityCatalogTreeNode[];

        const tablesGroup = groups.find(
            (g) => g.kind === "group" && (g as any).groupType === "tables"
        ) as UnityCatalogTreeNode;
        assert(tablesGroup, "expected tables group");
        const item = provider.getTreeItem(tablesGroup);
        assert.strictEqual(item.label, "Tables (1)");
    });

    it("owned schema sorts before unowned", async () => {
        const noFavStorage = {
            get: () => [],
            set: async () => {},
            onDidChange: () => ({dispose() {}}),
        } as unknown as StateStorage;
        when(mockSchemas.list(anything())).thenCall(() => {
            async function* impl() {
                yield {name: "s_c", full_name: "cat.s_c", owner: "carol"};
                yield {name: "s_b", full_name: "cat.s_b", owner: "bob"};
                yield {name: "s_a", full_name: "cat.s_a", owner: "alice"}; // owned
            }
            return impl();
        });
        const stubManager = {
            onDidChangeState: () => ({dispose() {}}),
            workspaceClient: instance(mockWorkspaceClient),
            databricksWorkspace: {user: {userName: "alice"}},
        } as unknown as ConnectionManager;
        const p = new UnityCatalogTreeDataProvider(stubManager, noFavStorage);
        disposables.push(p);
        const catalog: UnityCatalogTreeNode = {
            kind: "catalog",
            name: "cat",
            fullName: "cat",
        };
        const children = (await resolveProviderResult(
            p.getChildren(catalog)
        )) as UnityCatalogTreeNode[];
        assert.strictEqual((children[0] as any).name, "s_a"); // owned first
        assert.strictEqual((children[1] as any).name, "s_b"); // alphabetical
        assert.strictEqual((children[2] as any).name, "s_c"); // alphabetical
    });
});
