import { randomUUID } from "node:crypto";
import { QuickPickItemKind, ThemeIcon, type QuickInputButton, type QuickPickItem } from "vscode";
import { isAccountApiHost } from "../../kernel/connection/accountOnly";
import {
    hostKey,
    normalizeHost,
    profileCreationMethods,
    validateDatabricksHost,
    workspaceIdFromHost,
} from "../../kernel/connection/hostMatching";
import type { HostMetadata } from "../../kernel/connection/hostMetadata";
import type { ProfileInfo } from "../../kernel/connection/Profiles";
import { profilesForHost } from "../../kernel/connection/resolveConnection";
import {
    MultiStepInput,
    type InputStep,
    type QuickInputFactory,
    type TypedMatch,
} from "../../platform/ui/quickPick";
import { humaniseAuthType } from "./authTypes";
import { workspaceChoiceStep } from "./WorkspaceChoice";

/** What the user chose. `ConnectionCommands` carries it out. */
export type SignInChoice =
    | {
          readonly kind: "existing";
          readonly profile: ProfileInfo;
          /** Picked in the workspace step, as another profile for the account. */
          readonly workspaceSelection?: "existingProfile";
      }
    /** Without a host, the CLI signs in through login.databricks.com and writes the chosen workspace's host. */
    | {
          readonly kind: "oauth";
          readonly host?: string;
          readonly workspaceId?: string;
          readonly profile: string;
          /** The workspace step's ID, typed for a unified host. */
          readonly workspaceSelection?: "typed";
      }
    | {
          readonly kind: "pat";
          readonly host: string;
          readonly profile: string;
          readonly token: string;
      }
    | { readonly kind: "editConfigFile" };

export interface SignInWizardOptions {
    readonly profiles: readonly ProfileInfo[];
    /** Skips the host step, as when the host is known from a target. */
    readonly host?: string;
    /** Focused in the host step: the current connection's host, or the caller's. */
    readonly preselectHost?: string;
    /** Focused in the profile step, when it lists this profile. */
    readonly preselectProfile?: string;
    /** `DATABRICKS_HOST`, offered in the host step and preselected after the current host. */
    readonly envHost?: string;
    /** The initial name for a new profile, such as the bundle target. */
    readonly suggestedName?: string;
    /**
     * The profile the project's target names (`workspace.profile`). With no
     * profile on the machine, the first one is saved under this name, so the
     * target connects; otherwise it's DEFAULT.
     */
    readonly targetProfile?: string;
    /** The wizard's title, for a connection other than the workspace's. */
    readonly title?: string;
    readonly openPatPage: (url: string) => void;
    /**
     * The host's metadata. A new OAuth profile for a unified host, with no
     * workspace ID in the URL, chooses its workspace before the browser
     * login, so that one login is enough.
     */
    readonly hostMetadata?: (host: string) => Promise<HostMetadata | undefined>;
    /** Called when the wizard asks for the workspace of a unified host. */
    readonly onAccountOnly?: () => void;
    readonly openExternal?: (url: string) => void;
    readonly factory?: QuickInputFactory;
}

const TITLE = "Configure Databricks Workspace";

/** Why `name` can't be a new profile's, or undefined. The name prompt and the target's name share it. */
function profileNameProblem(name: string, taken: ReadonlySet<string>): string | undefined {
    if (name.length === 0) {
        return "Profile name cannot be empty";
    }
    if (name.includes(".")) {
        return "Profile name cannot contain dots";
    }
    if (taken.has(name)) {
        return `Profile ${name} already exists`;
    }
    return undefined;
}

/**
 * How long the auth choices wait for the host's metadata, with the picker busy.
 * Past it the host is treated as unknown, as an unreadable host is: a token stays offered.
 */
const METADATA_TIMEOUT_MS = 3_000;

/** The metadata, or undefined when it doesn't arrive within `ms` or can't be read. */
function metadataWithin(
    read: Promise<HostMetadata | undefined> | undefined,
    ms: number,
): Promise<HostMetadata | undefined> {
    if (read === undefined) {
        return Promise.resolve(undefined);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), ms);
    });
    return Promise.race([read.catch(() => undefined), late]).finally(() => clearTimeout(timer));
}

interface ProfileItem extends QuickPickItem {
    readonly action?: "oauth" | "pat" | "editConfigFile";
    readonly profile?: ProfileInfo;
}

/** The host step's first item: sign in without a host. */
const HOSTLESS_LABEL = "$(sign-in) Sign in via login.databricks.com";

const CREATE_PAT_BUTTON: QuickInputButton = {
    iconPath: new ThemeIcon("link-external"),
    tooltip: "Create a new Personal Access Token",
};

/**
 * One wizard for every entry point: the host, when it isn't
 * known; then the profiles for that host, and ways to create one. UI strings
 * are copied from the old `LoginWizard.ts`. It writes nothing: the CLI
 * creates profiles. Throws `CancelledError` when dismissed.
 */
export async function runSignInWizard(options: SignInWizardOptions): Promise<SignInChoice> {
    const title = options.title ?? TITLE;
    let host = options.host !== undefined ? hostKey(options.host) : undefined;
    let workspaceId = options.host !== undefined ? workspaceIdFromHost(options.host) : undefined;
    let choice: SignInChoice | undefined;
    // The host step, when there is one, comes before the auth method and
    // every step after it. The count assumes OAuth on a host that isn't
    // unified; a unified host's workspace step, or PAT's token step, adds one.
    const stepsBefore = options.host !== undefined ? 0 : 1;
    // With no profile on the machine, the first one isn't named, so there's no name step.
    const askName = options.profiles.length > 0;
    // The target's name is the first profile's when it passes the name prompt's own check.
    const takenNames = new Set(options.profiles.map((p) => p.name));
    const targetName = options.targetProfile;
    const firstProfileName =
        targetName !== undefined && profileNameProblem(targetName, takenNames) === undefined
            ? targetName
            : "DEFAULT";
    const nameSteps = askName ? 1 : 0;
    // A profile for account APIs can't connect to a workspace (`openConnection`
    // refuses it), so the lists leave it out. Its name stays taken.
    const profiles = options.profiles.filter(
        (p) => p.host === undefined || !isAccountApiHost(p.host),
    );

    const inputHost: InputStep = async (input) => {
        const hostless: QuickPickItem = {
            label: HOSTLESS_LABEL,
            detail: "Don't know your workspace URL? Pick your workspace in the browser",
        };
        const hosts: QuickPickItem[] = [];
        const byHost = new Map<string, string[]>();
        for (const p of profiles) {
            const key = hostKey(p.host);
            if (key !== undefined) {
                byHost.set(key, [...(byHost.get(key) ?? []), p.name]);
            }
        }
        const envHost = hostKey(options.envHost);
        if (options.envHost) {
            const envNames = envHost === undefined ? undefined : byHost.get(envHost);
            const envDetail = "DATABRICKS_HOST environment variable";
            hosts.push({
                label: options.envHost,
                detail: envNames?.length
                    ? `${envDetail}. Profiles: ${envNames.join(", ")}`
                    : envDetail,
            });
        }
        for (const [h, names] of byHost) {
            if (h !== envHost) {
                hosts.push({ label: h, detail: `Profiles: ${names.join(", ")}` });
            }
        }
        const preselect = hostKey(options.preselectHost) ?? envHost;
        let current = hosts.find((i) => hostKey(i.label) === preselect);
        if (current === undefined && preselect !== undefined) {
            current = { label: preselect, detail: "Current connection" };
        }
        // The workspaces together, the current one first, then the browser
        // sign-in: Enter on the first item never starts one by accident.
        const workspaces = current ? [current, ...hosts.filter((i) => i !== current)] : hosts;
        const items: QuickPickItem[] =
            workspaces.length > 0
                ? [...workspaces, { label: "", kind: QuickPickItemKind.Separator }, hostless]
                : [hostless];
        // The row each profile is on, by its host's key. Profiles with no row
        // (no workspace URL, or account APIs) have none.
        const rowByHost = new Map<string, QuickPickItem>();
        for (const item of workspaces) {
            const key = hostKey(item.label);
            if (key !== undefined) {
                rowByHost.set(key, item);
            }
        }
        const rowOf = (p: ProfileInfo): QuickPickItem | undefined => {
            const key = hostKey(p.host);
            return key === undefined ? undefined : rowByHost.get(key);
        };
        // The profile a typed name names: its exact case first, then any case.
        const exactProfile = (typed: string) =>
            options.profiles.find((p) => p.name === typed) ??
            options.profiles.find((p) => p.name.toLowerCase() === typed.toLowerCase());
        // What typed text names. An exact name, once trimmed, wins over longer
        // names that contain it: its own workspace's row, or, with no row, a
        // refusal, unless the text is a URL (a profile can be named like one).
        // Otherwise the rows of the workspaces of profiles whose names contain it.
        const matchTyped = (typed: string): TypedMatch => {
            const t = typed.trim();
            if (t === "") {
                return { rows: [] };
            }
            // A URL is a host, even when a profile is named exactly like it.
            if (/^https?:\/\//i.test(t)) {
                return { rows: [] };
            }
            const exact = exactProfile(t);
            if (exact !== undefined) {
                const row = rowOf(exact);
                return row !== undefined
                    ? { rows: [row] }
                    : {
                          rows: [],
                          refusal: `${t} is a profile with no workspace to pick. Type the workspace's URL instead.`,
                      };
            }
            const lower = t.toLowerCase();
            const named = profiles.filter(
                (p) => p.name.toLowerCase().includes(lower) && rowOf(p) !== undefined,
            );
            return { rows: [...new Set(named.map((p) => rowOf(p)!))] };
        };
        const value = await input.showQuickAutoComplete({
            title,
            step: 1,
            totalSteps: stepsBefore + 1 + nameSteps,
            placeholder:
                'Databricks Host (should begin with https://), or choose "Sign in via login.databricks.com"',
            validate: async (v) => validateDatabricksHost(v),
            items,
            activeItem: workspaces[0] ?? hostless,
            matchesTyped: matchTyped,
        });
        if (value === HOSTLESS_LABEL) {
            return (next: MultiStepInput) => createProfile(next, "oauth", { hostless: true });
        }
        host = hostKey(normalizeHost(value).toString());
        workspaceId = workspaceIdFromHost(value);
        return selectAuthMethod;
    };

    const selectAuthMethod: InputStep = async (input) => {
        const url = normalizeHost(host!);
        // The choices wait for it, busy: a unified host gets no token option, since the CLI's `configure` can't save its workspace.
        const metadata = metadataWithin(options.hostMetadata?.(host!), METADATA_TIMEOUT_MS);
        const existing = profilesForHost(profiles, { host, workspaceId });
        const choices = (meta: HostMetadata | undefined): ProfileItem[] => {
            const unified = meta?.hostType === "unified";
            const items: ProfileItem[] = existing.map((profile) => {
                const authType = humaniseAuthType(profile.authType);
                return {
                    label: profile.name,
                    detail: authType
                        ? `Select existing profile and authenticate using ${authType}`
                        : "Select existing profile and authenticate",
                    profile,
                };
            });
            const methods = profileCreationMethods(url).filter((m) => !(unified && m === "pat"));
            if (items.length > 0) {
                items.push({ label: "", kind: QuickPickItemKind.Separator });
            }
            for (const method of methods) {
                items.push(
                    method === "databricks-cli"
                        ? {
                              label: "OAuth" + (existing.length === 0 ? " (recommended)" : ""),
                              detail: "Create a profile and authenticate using OAuth",
                              action: "oauth",
                          }
                        : {
                              label: "Personal Access Token",
                              detail: "Create a profile and authenticate using a Personal Access Token",
                              action: "pat",
                          },
                );
            }
            items.push(
                { label: "", kind: QuickPickItemKind.Separator },
                {
                    label: "Edit Databricks profiles",
                    detail: "Open ~/.databrickscfg to create or edit profiles",
                    action: "editConfigFile",
                },
            );
            return items;
        };
        const pick = await input.showQuickPick<ProfileItem>({
            title,
            step: stepsBefore + 1,
            totalSteps: stepsBefore + 1 + nameSteps,
            placeholder: "Select authentication method",
            items: metadata.then(choices),
            activeItem: (all) =>
                all.find(
                    (i) => i.profile !== undefined && i.profile.name === options.preselectProfile,
                ),
        });
        if (pick.profile !== undefined) {
            choice = { kind: "existing", profile: pick.profile };
            return;
        }
        if (pick.action === "editConfigFile") {
            choice = { kind: "editConfigFile" };
            return;
        }
        const action = pick.action!;
        const meta = await metadata;
        if (meta?.hostType === "unified" && workspaceId === undefined && action === "oauth") {
            options.onAccountOnly?.();
            return workspaceStep(meta.accountId);
        }
        return (next: MultiStepInput) => createProfile(next, action);
    };

    // A unified host serves several workspaces, and without a terminal the
    // CLI can't ask which one: choose it here, before the browser login.
    const workspaceStep = (accountId: string | undefined): InputStep => {
        unifiedHost = true;
        return workspaceChoiceStep(
            {
                host: host!,
                accountId,
                profiles,
                offerSignInFirst: true,
                openExternal: (u) => options.openExternal?.(u),
                step: stepsBefore + 2,
                totalSteps: stepsBefore + 2 + nameSteps,
            },
            (c) => {
                switch (c.kind) {
                    case "profile": {
                        const profile = options.profiles.find((p) => p.name === c.profile)!;
                        choice = {
                            kind: "existing",
                            profile,
                            workspaceSelection: "existingProfile",
                        };
                        return;
                    }
                    case "workspace":
                        workspaceId = c.workspaceId;
                        typedWorkspace = true;
                        return (next: MultiStepInput) => createProfile(next, "oauth");
                    case "signInFirst":
                        // The connection then finds the profile signed in to the account only, and asks.
                        return (next: MultiStepInput) => createProfile(next, "oauth");
                }
            },
        );
    };
    let typedWorkspace = false;
    let unifiedHost = false;

    // Without a host there is no auth-method step: OAuth is the only way.
    const createProfile = async (
        input: MultiStepInput,
        action: "oauth" | "pat",
        { hostless = false } = {},
    ) => {
        // After the workspace step, if the host had one. Without a name step, a PAT's token is the last step.
        const step = hostless ? stepsBefore + 1 : stepsBefore + (unifiedHost ? 3 : 2);
        const totalSteps = action === "pat" && askName ? step + 1 : step;
        // The first profile on the machine: the target's, or DEFAULT, which the CLI uses by default too.
        let profile = firstProfileName;
        if (askName) {
            const taken = takenNames;
            let initialValue = options.suggestedName ?? (hostless ? "DEFAULT" : "");
            if (taken.has(initialValue)) {
                initialValue = `${options.suggestedName ?? "dev"}-${randomUUID().slice(0, 8)}`;
            }
            profile = await input.showInputBox({
                title: "Enter a name for the new profile",
                step,
                totalSteps,
                placeholder: "Enter a name for the new profile",
                initialValue,
                validate: async (value) => {
                    const problem = profileNameProblem(value, taken);
                    return problem === undefined ? undefined : { message: problem, type: "error" };
                },
            });
        }
        if (action === "oauth") {
            choice = hostless
                ? { kind: "oauth", profile }
                : {
                      kind: "oauth",
                      host: host!,
                      workspaceId,
                      profile,
                      ...(typedWorkspace ? { workspaceSelection: "typed" as const } : {}),
                  };
            return;
        }
        return async (next: MultiStepInput) => {
            const token = await next.showInputBox({
                title: "Enter Personal Access Token",
                step: totalSteps,
                totalSteps,
                placeholder: "Enter Personal Access Token",
                password: true,
                buttons: [CREATE_PAT_BUTTON],
                onButton: () =>
                    options.openPatPage(`${host}/settings/user/developer/access-tokens`),
                validate: async (value) =>
                    value.length === 0
                        ? { message: "Token cannot be empty", type: "error" }
                        : undefined,
            });
            choice = { kind: "pat", host: host!, profile, token: token.trim() };
        };
    };

    await MultiStepInput.run(
        options.host !== undefined ? selectAuthMethod : inputHost,
        options.factory,
    );
    if (choice === undefined) {
        throw new Error("The sign-in wizard ended without a choice");
    }
    return choice;
}
