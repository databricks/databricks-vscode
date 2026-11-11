import { newPatCredentials } from "@databricks/sdk-auth/credentials";
import { CatalogsClient } from "@databricks/sdk-uc-catalogs/v1";
import { EntityTagAssignmentsClient } from "@databricks/sdk-uc-entitytagassignments/v1";
import { FunctionsClient } from "@databricks/sdk-uc-functions/v1";
import { GrantsClient } from "@databricks/sdk-uc-grants/v1";
import { RegisteredModelsClient } from "@databricks/sdk-uc-registeredmodels/v1";
import { SchemasClient } from "@databricks/sdk-uc-schemas/v1";
import { TablesClient } from "@databricks/sdk-uc-tables/v1";
import { VolumesClient } from "@databricks/sdk-uc-volumes/v1";
import { describe, expect, it } from "vitest";
import { FakeHttpClient } from "../../test-support/fakeHttp";
import { ApiClients, calls } from "./ApiClients";
import { pathValue } from "./pathValue";

const UC = "/api/2.1/unity-catalog";
const name = pathValue("c.s.x#1");

describe("pathValue", () => {
    it("encodes what would end or change a URL path, and keeps plain names and /", () => {
        expect(pathValue("c.s.v#1?x%y\\z")).toBe("c.s.v%231%3Fx%25y%5Cz");
        expect(pathValue("main.default.my_table-2")).toBe("main.default.my_table-2");
        expect(pathValue("apps/my app")).toBe("apps/my%20app");
    });

    // Every call with a name in the path. Once the SDK encodes path values itself, these arrive
    // encoded twice ("%2523") and fail: then pathValue goes.
    it.each([
        [
            "getCatalog",
            (a: ApiClients) => a.get(CatalogsClient).getCatalog({ nameArg: name }, calls.read()),
            `${UC}/catalogs/c.s.x%231`,
        ],
        [
            "getSchema",
            (a: ApiClients) => a.get(SchemasClient).getSchema({ fullNameArg: name }, calls.read()),
            `${UC}/schemas/c.s.x%231`,
        ],
        [
            "getTable",
            (a: ApiClients) => a.get(TablesClient).getTable({ fullNameArg: name }, calls.read()),
            `${UC}/tables/c.s.x%231`,
        ],
        [
            "getVolume",
            (a: ApiClients) => a.get(VolumesClient).getVolume({ fullNameArg: name }, calls.read()),
            `${UC}/volumes/c.s.x%231`,
        ],
        [
            "getFunction",
            (a: ApiClients) =>
                a.get(FunctionsClient).getFunction({ fullNameArg: name }, calls.read()),
            `${UC}/functions/c.s.x%231`,
        ],
        [
            "getRegisteredModel",
            (a: ApiClients) =>
                a
                    .get(RegisteredModelsClient)
                    .getRegisteredModel({ fullNameArg: name }, calls.read()),
            `${UC}/models/c.s.x%231`,
        ],
        [
            "getModelVersion",
            (a: ApiClients) =>
                a
                    .get(RegisteredModelsClient)
                    .getModelVersion({ fullNameArg: name, versionArg: 3n }, calls.read()),
            `${UC}/models/c.s.x%231/versions/3`,
        ],
        [
            "listModelVersions",
            (a: ApiClients) =>
                a
                    .get(RegisteredModelsClient)
                    .listModelVersions({ fullNameArg: name }, calls.read()),
            `${UC}/models/c.s.x%231/versions`,
        ],
        [
            "getEffectivePermissions",
            (a: ApiClients) =>
                a
                    .get(GrantsClient)
                    .getEffectivePermissions(
                        { securableType: "VOLUME", securableFullName: name },
                        calls.read(),
                    ),
            `${UC}/effective-permissions/VOLUME/c.s.x%231`,
        ],
        [
            "listEntityTagAssignments",
            (a: ApiClients) =>
                a
                    .get(EntityTagAssignmentsClient)
                    .listEntityTagAssignments(
                        { entityType: "volumes", entityName: name },
                        calls.read(),
                    ),
            `${UC}/entity-tag-assignments/volumes/c.s.x%231/tags`,
        ],
    ] as const)("%s sends the path value as given", async (_, call, path) => {
        const http = new FakeHttpClient().onPrefix("GET", UC, () => ({ body: {} }));
        const api = new ApiClients({
            host: "https://a.cloud.databricks.com",
            credentials: newPatCredentials("dapi-1"),
            httpClient: http,
        });
        await call(api);
        expect(http.requests.map((r) => new URL(r.url).pathname)).toEqual([path]);
    });
});
