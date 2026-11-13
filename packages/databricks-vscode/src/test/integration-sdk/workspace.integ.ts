import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WorkspaceFilesModel } from "../../features/workspace-files/WorkspaceFilesModel";
import { ClusterListClient } from "../../kernel/connection/ClusterListClient";
import type { Connection } from "../../kernel/connection/ConnectionService";
import { HostMetadataCache } from "../../kernel/connection/hostMetadata";
import { nodeHttpClient } from "../../kernel/connection/nodeHttpClient";
import { openConnection, profileTarget } from "../../kernel/connection/openConnection";
import { readProfiles } from "../../kernel/connection/Profiles";
import { fakeLog } from "../../test-support/fakes";

/**
 * The extension's SDK clients against a real workspace, as the old extension's SDK wrapper
 * tests were: it connects as the extension does, from the `[DEFAULT]` profile in
 * DATABRICKS_CONFIG_FILE (a personal access token; scripts/integration/sdk.mjs makes it).
 * TEST_DEFAULT_CLUSTER_ID, when set, names a cluster the user can attach.
 */
describe("the SDK clients, against a real workspace", () => {
    let connection: Connection;

    beforeAll(async () => {
        const configFile = process.env["DATABRICKS_CONFIG_FILE"];
        expect(configFile, "DATABRICKS_CONFIG_FILE names the profile to test with").toBeTruthy();
        const profile = (await readProfiles(configFile!)).profiles.find(
            (p) => p.name === "DEFAULT",
        );
        expect(profile?.host, "the [DEFAULT] profile has a host").toBeTruthy();
        const noCli = () => Promise.reject(new Error("The SDK tests sign in with a token only."));
        const log = fakeLog();
        connection = await openConnection(
            profileTarget(profile!, { u2mToken: noCli, azureCliToken: noCli }),
            { kind: "defaultProfile" },
            { hostMetadata: new HostMetadataCache(nodeHttpClient(), log), log },
            AbortSignal.timeout(60_000),
        );
    });

    it("signs in with the profile's token and reads the user (SCIM me)", () => {
        expect(connection.userName).not.toBe("");
        expect(connection.authType).toBe("pat");
    });

    it.skipIf(!process.env["TEST_DEFAULT_CLUSTER_ID"])(
        "lists the clusters the user can attach, the test cluster among them",
        async () => {
            const ids: string[] = [];
            for await (const cluster of connection.api.get(ClusterListClient).listIter()) {
                ids.push(cluster.id);
            }
            expect(ids).toContain(process.env["TEST_DEFAULT_CLUSTER_ID"]);
        },
    );

    describe("workspace files, in a folder of the user's home", () => {
        let files: WorkspaceFilesModel;
        let folder: string;

        beforeAll(() => {
            files = new WorkspaceFilesModel(connection);
            folder = `${files.root}/.databricks-vscode-integ-${randomUUID()}`;
        });

        afterAll(async () => {
            await files?.delete(folder, true);
            files?.dispose();
        });

        it("creates a folder, writes and reads a file, lists and deletes it", async () => {
            expect((await files.mkdir(folder))?.type).toBe("DIRECTORY");
            const file = `${folder}/hello.txt`;
            await files.write(file, new TextEncoder().encode("hello"), false);
            expect(new TextDecoder().decode(await files.read(file))).toBe("hello");
            expect((await files.list(folder))?.map((e) => e.path)).toEqual([file]);
            await files.delete(file, false);
            expect(await files.stat(file)).toBeUndefined();
        });
    });
});
