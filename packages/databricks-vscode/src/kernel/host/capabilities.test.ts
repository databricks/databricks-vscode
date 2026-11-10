import { describe, expect, it } from "vitest";
import {
    DEDICATED_INTERPRETER,
    DEDICATED_SESSION,
    SERVERLESS_INTERPRETER,
    SERVERLESS_SESSION,
    SERVERLESS_SESSION_ENV,
    SESSION_REMOTE_NAME,
} from "../../test-support/sessionEnv";
import { capabilitiesOf, type HostCapabilities } from "./capabilities";
import { detectHost } from "./Host";

const LOCAL: HostCapabilities = {
    identity: "profiles",
    projects: "anyFolder",
    python: { kind: "managed" },
    workspaceFiles: { kind: "api" },
    compute: "perTarget",
    newProjects: true,
    tunnel: true,
    aiTools: true,
    unityGateway: true,
};

const SESSION = (interpreter: string): HostCapabilities => ({
    identity: "session",
    projects: "sessionWorkspace",
    python: { kind: "session", interpreter },
    workspaceFiles: { kind: "mounted", root: "/Workspace" },
    compute: "session",
    newProjects: false,
    tunnel: false,
    aiTools: false,
    unityGateway: false,
});

describe("capabilitiesOf", () => {
    it.each([
        ["a local window", { kind: "local" } as const, false, LOCAL],
        [
            "a local window in Cursor",
            { kind: "local" } as const,
            true,
            { ...LOCAL, unityGateway: false },
        ],
        [
            "compute without a session, by local rules",
            { kind: "compute", runtimeVersion: "17.3" } as const,
            false,
            LOCAL,
        ],
        ["a serverless session", SERVERLESS_SESSION, false, SESSION(SERVERLESS_INTERPRETER)],
        ["a dedicated cluster's session", DEDICATED_SESSION, false, SESSION(DEDICATED_INTERPRETER)],
    ])("%s", (_name, host, isCursor, expected) => {
        expect(capabilitiesOf(host, { isCursor })).toEqual(expected);
    });

    it("gives a session without an interpreter none to select", () => {
        const env = { ...SERVERLESS_SESSION_ENV, DATABRICKS_VIRTUAL_ENV: "" };
        const host = detectHost(env, { remoteName: SESSION_REMOTE_NAME });
        expect(capabilitiesOf(host, { isCursor: false }).python).toEqual({ kind: "session" });
    });
});
