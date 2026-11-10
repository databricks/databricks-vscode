import { isAccountOnly } from "./accountOnly";
import { hostKey, sameWorkspace, workspaceIdFromHost, type WorkspaceRef } from "./hostMatching";
import type { ProfileInfo } from "./Profiles";

/**
 * Which connection a window uses. A pure function of its
 * inputs, so every row of the table is a unit test.
 *
 * A session window's identity is the session's, whatever else; otherwise a
 * bundle project's target decides; without a project, the user's choice or
 * the CLI's default does.
 */

/** Why this profile was chosen; shown in the status bar's tooltip. */
export type ConnectionSource =
    | { kind: "session" }
    | { kind: "saved" }
    | { kind: "envProfile" }
    | { kind: "defaultProfileSetting" }
    | { kind: "defaultProfile" }
    | { kind: "savedForTarget"; target: string }
    | { kind: "workspaceProfile"; target: string }
    | { kind: "onlyProfileForHost"; host: string }
    | { kind: "unityGateway" };

export function describeSource(source: ConnectionSource): string {
    switch (source.kind) {
        case "session":
            return "the SSH tunnel's session";
        case "saved":
            return "your choice for windows without a project";
        case "envProfile":
            return "DATABRICKS_CONFIG_PROFILE";
        case "defaultProfileSetting":
            return "default_profile in the config file";
        case "defaultProfile":
            return "the DEFAULT profile";
        case "savedForTarget":
            return `your choice for target ${source.target}`;
        case "workspaceProfile":
            return `workspace.profile of target ${source.target}`;
        case "onlyProfileForHost":
            return `the only profile for ${source.host}`;
        case "unityGateway":
            return "your Unity Gateway sign-in";
    }
}

/**
 * The choice saved for windows without a project (global state). `signedOut`
 * records an explicit sign-out, so the resolver doesn't reconnect at once to
 * the default profile.
 */
export type SavedChoice = { readonly profile: string } | { readonly signedOut: true };

/** What the resolver needs to know about the active bundle project. */
export interface ProjectInputs {
    /** Undefined when the bundle has several targets and none is chosen. */
    readonly target?: string;
    /** The target's `workspace.host`, as written. */
    readonly host?: string;
    /** The target's `workspace.profile`. */
    readonly workspaceProfile?: string;
    /** `authProfile` in the target's `vscode.overrides.json`. */
    readonly savedProfile?: string;
    /** The user signed out of this target. */
    readonly signedOut?: boolean;
}

/** A session's credentials, as `detectHost` read them; undefined where the environment lacks them. */
export interface SessionCredentials {
    readonly host?: string;
    readonly authType?: "pat" | "oauth-m2m";
}

export interface ResolverInputs {
    /** A session window: its identity is the session's. */
    readonly session?: SessionCredentials;
    /** A bundle project is active. */
    readonly project?: ProjectInputs;
    readonly saved?: SavedChoice;
    /** `DATABRICKS_CONFIG_PROFILE` from the extension host. */
    readonly envProfile?: string;
    readonly profiles: readonly ProfileInfo[];
    /** `[__settings__] default_profile`. */
    readonly defaultProfileSetting?: string;
}

export type Resolution =
    | {
          readonly kind: "profile";
          readonly profile: ProfileInfo;
          readonly source: ConnectionSource;
          /** The target's workspace, for a profile signed in to its account only. */
          readonly targetWorkspace?: TargetWorkspace;
      }
    | {
          readonly kind: "session";
          readonly host: string;
          readonly authType: "pat" | "oauth-m2m";
          readonly source: ConnectionSource;
      }
    | {
          readonly kind: "signedOut";
          readonly reason: string;
          /** The target's host, for the sign-in wizard. */
          readonly host?: string;
          /** Several profiles match the target's host: the user picks one. */
          readonly candidates?: readonly string[];
      }
    | { readonly kind: "error"; readonly message: string };

/** A workspace that a bundle target's `workspace.host` names with `?o=` or `?w=`. */
export interface TargetWorkspace {
    readonly workspaceId: string;
    readonly target: string;
}

export function resolveConnection(inputs: ResolverInputs): Resolution {
    if (inputs.session !== undefined) {
        return resolveSession(inputs.session);
    }
    if (inputs.project !== undefined) {
        return resolveForProject(inputs.project, inputs.profiles);
    }
    return resolveWithoutProject(inputs);
}

/**
 * A bundle project: the profile saved for the target, then
 * the target's `workspace.profile`, then the only profile for the target's
 * host. A saved or named profile for another host is skipped, because the
 * CLI would refuse it for this target.
 */
function resolveForProject(project: ProjectInputs, profiles: readonly ProfileInfo[]): Resolution {
    const { target } = project;
    if (target === undefined) {
        return { kind: "signedOut", reason: "No target is selected." };
    }
    const byName = (name: string | undefined) =>
        name === undefined ? undefined : profiles.find((p) => p.name === name);
    const named = byName(project.workspaceProfile);
    // `workspace.profile` alone is enough: the host then comes from the profile.
    // `${var.x}` is resolved by `bundle validate` only, so it can't match here.
    const written = project.host?.includes("${") ? undefined : hostKey(project.host);
    const host = written ?? (project.host === undefined ? named?.host : undefined);
    const workspace = {
        host,
        workspaceId: project.host ? workspaceIdFromHost(project.host) : undefined,
    };
    if (host === undefined) {
        return {
            kind: "signedOut",
            reason:
                project.host === undefined
                    ? `Target '${target}' doesn't set workspace.host.`
                    : `Target '${target}' has an invalid workspace.host: ${project.host}`,
        };
    }
    if (project.signedOut) {
        return { kind: "signedOut", reason: `You signed out of target '${target}'.`, host };
    }
    const matches = (p: ProfileInfo | undefined): p is ProfileInfo =>
        p !== undefined && sameWorkspace({ host: p.host, workspaceId: p.workspaceId }, workspace);

    // A profile signed in to the account only gets the target's workspace,
    // in memory: the profile stays as it is.
    const found = (profile: ProfileInfo, source: ConnectionSource): Resolution =>
        workspace.workspaceId !== undefined && isAccountOnly(profile)
            ? {
                  kind: "profile",
                  profile,
                  source,
                  targetWorkspace: { workspaceId: workspace.workspaceId, target },
              }
            : { kind: "profile", profile, source };

    const saved = byName(project.savedProfile);
    if (matches(saved)) {
        return found(saved, { kind: "savedForTarget", target });
    }
    if (matches(named)) {
        return found(named, { kind: "workspaceProfile", target });
    }
    const forHost = profilesForHost(profiles, workspace);
    if (forHost.length === 1) {
        return found(forHost[0]!, { kind: "onlyProfileForHost", host });
    }
    if (forHost.length === 0) {
        return { kind: "signedOut", reason: `No profile for ${host}.`, host };
    }
    const names = forHost.map((p) => p.name);
    return {
        kind: "signedOut",
        reason: `Profiles ${listNames(names)} ${names.length === 2 ? "both" : "all"} match ${host}.`,
        host,
        candidates: names,
    };
}

/** `A and B`, or `A, B and C`. */
function listNames(names: readonly string[]): string {
    return names.length <= 1
        ? (names[0] ?? "")
        : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function resolveWithoutProject(inputs: ResolverInputs): Resolution {
    const byName = (name: string | undefined) =>
        name === undefined ? undefined : inputs.profiles.find((p) => p.name === name);

    const choice = inputs.saved;
    if (choice !== undefined && "signedOut" in choice) {
        return { kind: "signedOut", reason: "You signed out." };
    }
    const saved = byName(choice?.profile);
    if (saved !== undefined) {
        return usable(saved, { kind: "saved" });
    }

    // The CLI's default: DATABRICKS_CONFIG_PROFILE, then default_profile,
    // then DEFAULT. A named default that doesn't exist is reported,
    // not skipped, as the CLI would fail on it too.
    const [name, source]: [string, ConnectionSource] = inputs.envProfile
        ? [inputs.envProfile, { kind: "envProfile" }]
        : inputs.defaultProfileSetting
          ? [inputs.defaultProfileSetting, { kind: "defaultProfileSetting" }]
          : ["DEFAULT", { kind: "defaultProfile" }];
    const profile = byName(name);
    if (profile === undefined) {
        const missingSaved =
            choice !== undefined ? `Profile '${choice.profile}' no longer exists. ` : "";
        if (source.kind === "defaultProfile") {
            return { kind: "signedOut", reason: `${missingSaved}No profile is selected.` };
        }
        return {
            kind: "signedOut",
            reason: `${missingSaved}Profile '${name}', named by ${describeSource(source)}, doesn't exist.`,
        };
    }
    return usable(profile, source);
}

function usable(profile: ProfileInfo, source: ConnectionSource): Resolution {
    if (profile.host === undefined) {
        return { kind: "error", message: `Profile '${profile.name}' has no valid host.` };
    }
    return { kind: "profile", profile, source };
}

/** A session: the host plus PAT or M2M credentials in `DATABRICKS_*`. */
function resolveSession(session: SessionCredentials): Resolution {
    const { host, authType } = session;
    const missing: string[] = [];
    if (host === undefined) {
        missing.push("a valid DATABRICKS_HOST");
    }
    if (authType === undefined) {
        missing.push("DATABRICKS_TOKEN (or DATABRICKS_CLIENT_ID and DATABRICKS_CLIENT_SECRET)");
    }
    if (host === undefined || authType === undefined) {
        return {
            kind: "error",
            message: `The session's environment lacks ${missing.join(" and ")}. Start the SSH tunnel again from a local window.`,
        };
    }
    return { kind: "session", host, authType, source: { kind: "session" } };
}

/** The profiles for a host, for the sign-in wizard's profile step. */
export function profilesForHost(
    profiles: readonly ProfileInfo[],
    workspace: WorkspaceRef,
): ProfileInfo[] {
    return profiles.filter((p) =>
        sameWorkspace({ host: p.host, workspaceId: p.workspaceId }, workspace),
    );
}
