import { describe, expect, it } from "vitest";
import { runningWorkspaces } from "./accountWorkspaces";

describe("runningWorkspaces", () => {
    it("keeps the running ones and those without a status, by name, and names one without a name by its ID", () => {
        expect(
            runningWorkspaces([
                { workspaceId: 2n, workspaceName: "prod", workspaceStatus: "RUNNING" },
                { workspaceId: 3n, workspaceName: "new", workspaceStatus: "PROVISIONING" },
                { workspaceName: "no id", workspaceStatus: "RUNNING" },
                { workspaceId: 1n, workspaceName: "dev" },
                { workspaceId: 9007199254740993n, workspaceStatus: "RUNNING" },
            ]),
        ).toEqual([
            { id: "9007199254740993", name: "9007199254740993" },
            { id: "1", name: "dev" },
            { id: "2", name: "prod" },
        ]);
    });
});
