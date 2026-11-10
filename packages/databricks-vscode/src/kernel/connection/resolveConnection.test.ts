import { describe, expect, it } from "vitest";
import type { ProfileInfo } from "./Profiles";
import {
    profilesForHost,
    resolveConnection,
    type ProjectInputs,
    type ResolverInputs,
} from "./resolveConnection";

const profile = (name: string, host?: string, workspaceId?: string): ProfileInfo => ({
    name,
    host,
    workspaceId,
    authType: "pat",
    profile: { name, host },
});

const A = "https://a.cloud.databricks.com";
const profiles = [
    profile("DEFAULT", A),
    profile("dev", A),
    profile("prod", "https://b.cloud.databricks.com"),
    profile("nohost"),
];

/** Without a project, and in a session. */
const table: [string, Partial<ResolverInputs>, string][] = [
    // No project: 1. the profile saved for windows without a project.
    [
        "the saved profile wins",
        { saved: { profile: "prod" }, envProfile: "dev" },
        "profile prod (saved)",
    ],
    // 2. The CLI default: DATABRICKS_CONFIG_PROFILE, then default_profile, then DEFAULT.
    [
        "DATABRICKS_CONFIG_PROFILE",
        { envProfile: "dev", defaultProfileSetting: "prod" },
        "profile dev (envProfile)",
    ],
    [
        "[__settings__] default_profile",
        { defaultProfileSetting: "prod" },
        "profile prod (defaultProfileSetting)",
    ],
    ["DEFAULT", {}, "profile DEFAULT (defaultProfile)"],
    [
        "a saved profile that no longer exists falls back to the default",
        { saved: { profile: "gone" } },
        "profile DEFAULT (defaultProfile)",
    ],
    // When nothing matches: signed out, with a reason.
    ["no DEFAULT", { profiles: [profile("dev", A)] }, "signedOut: No profile is selected."],
    [
        "a DATABRICKS_CONFIG_PROFILE that doesn't exist",
        { envProfile: "missing" },
        "signedOut: Profile 'missing', named by DATABRICKS_CONFIG_PROFILE, doesn't exist.",
    ],
    [
        "a default_profile that doesn't exist, after a missing saved profile",
        { saved: { profile: "gone" }, defaultProfileSetting: "missing" },
        "signedOut: Profile 'gone' no longer exists. Profile 'missing', named by default_profile in the config file, doesn't exist.",
    ],
    ["an empty config file", { profiles: [] }, "signedOut: No profile is selected."],
    // An explicit sign-out is not undone by the default profile.
    [
        "an explicit sign-out",
        { saved: { signedOut: true }, envProfile: "dev" },
        "signedOut: You signed out.",
    ],
    [
        "a profile without a host",
        { saved: { profile: "nohost" } },
        "error: Profile 'nohost' has no valid host.",
    ],
    // A session window: the session's identity.
    [
        "a session with a PAT, over the no-project choice",
        {
            session: { host: "https://r.cloud.databricks.com", authType: "pat" },
            saved: { profile: "dev" },
        },
        "session https://r.cloud.databricks.com pat",
    ],
    [
        "a session with M2M",
        { session: { host: "https://r.cloud.databricks.com", authType: "oauth-m2m" } },
        "session https://r.cloud.databricks.com oauth-m2m",
    ],
    [
        "a session without a valid host",
        { session: { authType: "pat" } },
        "error: The session's environment lacks a valid DATABRICKS_HOST. Start the SSH tunnel again from a local window.",
    ],
    [
        "a session without credentials",
        { session: { host: "https://r.cloud.databricks.com" } },
        "error: The session's environment lacks DATABRICKS_TOKEN (or DATABRICKS_CLIENT_ID and DATABRICKS_CLIENT_SECRET). Start the SSH tunnel again from a local window.",
    ],
];

const B = "https://b.cloud.databricks.com";
/** A project whose target `dev` points at host A. */
const dev = (project: Partial<ProjectInputs> = {}): Partial<ResolverInputs> => ({
    project: { target: "dev", host: A, ...project },
});

/** In a bundle project. */
const projectTable: [string, Partial<ResolverInputs>, string][] = [
    // 1. The profile saved for the target, if its host matches.
    [
        "the saved profile wins",
        dev({ savedProfile: "dev", workspaceProfile: "DEFAULT" }),
        "profile dev (savedForTarget)",
    ],
    [
        "a saved profile for another host is skipped",
        dev({ savedProfile: "prod" }),
        "signedOut: Profiles DEFAULT and dev both match https://a.cloud.databricks.com.",
    ],
    [
        "a saved profile that no longer exists is skipped",
        dev({ savedProfile: "gone", workspaceProfile: "dev" }),
        "profile dev (workspaceProfile)",
    ],
    // 2. The target's workspace.profile, if its host matches.
    ["workspace.profile", dev({ workspaceProfile: "dev" }), "profile dev (workspaceProfile)"],
    [
        "workspace.profile for another host is skipped",
        { project: { target: "dev", host: B, workspaceProfile: "DEFAULT" } },
        "profile prod (onlyProfileForHost)",
    ],
    [
        "workspace.profile alone gives the host",
        { project: { target: "dev", workspaceProfile: "prod" } },
        "profile prod (workspaceProfile)",
    ],
    // 3. The only profile for the host.
    [
        "the only profile for the host",
        { project: { target: "dev", host: B } },
        "profile prod (onlyProfileForHost)",
    ],
    [
        "hosts match regardless of case and trailing slash",
        { project: { target: "dev", host: "https://B.cloud.databricks.com/" } },
        "profile prod (onlyProfileForHost)",
    ],
    // When nothing matches: signed out, with a reason.
    [
        "several profiles for the host",
        dev(),
        "signedOut: Profiles DEFAULT and dev both match https://a.cloud.databricks.com.",
    ],
    [
        "three profiles for the host",
        { ...dev(), profiles: [...profiles, profile("third", A)] },
        "signedOut: Profiles DEFAULT, dev and third all match https://a.cloud.databricks.com.",
    ],
    [
        "no profile for the host",
        { project: { target: "dev", host: "https://c.cloud.databricks.com" } },
        "signedOut: No profile for https://c.cloud.databricks.com.",
    ],
    ["no target selected", { project: {} }, "signedOut: No target is selected."],
    [
        "a target without a host",
        { project: { target: "dev" } },
        "signedOut: Target 'dev' doesn't set workspace.host.",
    ],
    [
        "a target with a variable as its host",
        { project: { target: "dev", host: "${var.host}" } },
        "signedOut: Target 'dev' has an invalid workspace.host: ${var.host}",
    ],
    // An explicit sign-out of the target is not undone by a matching profile.
    [
        "an explicit sign-out",
        dev({ savedProfile: "dev", signedOut: true }),
        "signedOut: You signed out of target 'dev'.",
    ],
    // The project wins over the choice for windows without a project, and a session over both.
    [
        "the project wins over the no-project choice",
        { ...dev({ savedProfile: "dev" }), saved: { profile: "prod" } },
        "profile dev (savedForTarget)",
    ],
    [
        "a session wins over the project",
        {
            ...dev({ savedProfile: "dev" }),
            session: { host: "https://r.cloud.databricks.com", authType: "pat" },
        },
        "session https://r.cloud.databricks.com pat",
    ],
];

function summary(inputs: Partial<ResolverInputs>): string {
    const r = resolveConnection({ profiles, ...inputs });
    switch (r.kind) {
        case "profile":
            return `profile ${r.profile.name} (${r.source.kind})`;
        case "session":
            return `session ${r.host} ${r.authType}`;
        case "signedOut":
            return `signedOut: ${r.reason}`;
        case "error":
            return `error: ${r.message}`;
    }
}

describe("resolveConnection", () => {
    for (const [name, inputs, expected] of table) {
        it(name, () => {
            expect(summary(inputs)).toBe(expected);
        });
    }
});

describe("resolveConnection in a project", () => {
    for (const [name, inputs, expected] of projectTable) {
        it(name, () => {
            expect(summary(inputs)).toBe(expected);
        });
    }

    it("separates workspaces on a unified host by the workspace ID in the target's host", () => {
        const unified = [
            profile("w1", "https://u.databricks.com", "1"),
            profile("w2", "https://u.databricks.com", "2"),
        ];
        expect(
            summary({
                profiles: unified,
                project: { target: "dev", host: "https://u.databricks.com/?o=2" },
            }),
        ).toBe("profile w2 (onlyProfileForHost)");
    });

    it("lists the candidates and the host when several profiles match", () => {
        expect(resolveConnection({ profiles, project: { target: "dev", host: A } })).toEqual({
            kind: "signedOut",
            reason: "Profiles DEFAULT and dev both match https://a.cloud.databricks.com.",
            host: A,
            candidates: ["DEFAULT", "dev"],
        });
    });
});

describe("profilesForHost", () => {
    const unified = [
        profile("w1", "https://u.databricks.com", "1"),
        profile("w2", "https://u.databricks.com", "2"),
        profile("any", "https://u.databricks.com"),
        profile("slash", "https://a.cloud.databricks.com"),
    ];

    it("matches regardless of trailing slashes and case", () => {
        expect(
            profilesForHost(unified, { host: "https://A.cloud.databricks.com/" }).map(
                (p) => p.name,
            ),
        ).toEqual(["slash"]);
    });

    it("separates workspaces on a unified host by workspace ID", () => {
        expect(
            profilesForHost(unified, { host: "https://u.databricks.com", workspaceId: "2" }).map(
                (p) => p.name,
            ),
        ).toEqual(["w2", "any"]);
        expect(
            profilesForHost(unified, { host: "https://u.databricks.com" }).map((p) => p.name),
        ).toEqual(["w1", "w2", "any"]);
    });
});
