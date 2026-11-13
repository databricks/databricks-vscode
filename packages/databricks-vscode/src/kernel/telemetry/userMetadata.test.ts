import { hashSync } from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import { toUserMetadata } from "./userMetadata";

vi.mock("bcryptjs", async (importOriginal) => {
    const actual = await importOriginal<typeof import("bcryptjs")>();
    return { ...actual, hashSync: vi.fn(actual.hashSync) };
});

const user = {
    userName: "miles@databricks.com",
    host: "my.databricks.com",
    workspaceId: "workspace-id",
    authType: "azure-cli",
};

describe("toUserMetadata", () => {
    it("returns synchronously, with the same hash as the old extension", () => {
        expect(toUserMetadata(user)).toEqual({
            // The value the old extension's test pinned for this user name.
            hashedUserName: "$2b$07$97f780c0d2a202b5f54aeOJ9MKnLacIH6dXoDUpQLfJXKjhYqxJLW",
            host: "my.databricks.com",
            workspaceId: "workspace-id",
            authType: "azure-cli",
        });
    });

    it("hashes each user name once per session", () => {
        const other = { ...user, userName: "cached@databricks.com" };
        vi.mocked(hashSync).mockClear();
        toUserMetadata(other);
        toUserMetadata(other);
        expect(
            vi.mocked(hashSync).mock.calls.filter(([name]) => name === other.userName),
        ).toHaveLength(1);
    });
});
