import {
    QuickPickItemKind,
    ThemeIcon,
    window,
    type QuickInputButton,
    type QuickPickItem,
} from "vscode";
import type { AccountWorkspace } from "../../kernel/connection/accountWorkspaces";
import { hostKey, workspaceIdFromHost } from "../../kernel/connection/hostMatching";
import type { ProfileInfo } from "../../kernel/connection/Profiles";
import type { WorkspaceAccess } from "../../kernel/connection/openConnection";
import {
    MultiStepInput,
    type InputStep,
    type QuickInputFactory,
} from "../../platform/ui/quickPick";

/**
 * Which workspace a profile signed in to the account only should use, on a
 * unified host. It writes nothing: `ConnectionCommands` saves the choice
 * through the CLI.
 */
export type WorkspaceChoice =
    /** Another profile that names a workspace, so switching to it needs no login. */
    | { readonly kind: "profile"; readonly profile: string }
    /**
     * A typed ID, or one from the account's list (`fromList`); `newProfile`
     * when the user keeps the profile as it is and creates another.
     */
    | {
          readonly kind: "workspace";
          readonly workspaceId: string;
          readonly newProfile?: string;
          readonly fromList?: true;
      }
    /** The wizard's "I don't know, sign in first". */
    | { readonly kind: "signInFirst" };

export interface WorkspaceChoiceOptions {
    /** The unified host, normalised. */
    readonly host: string;
    /** The profile the choice updates; undefined in the sign-in wizard, before it exists. */
    readonly profile?: string;
    readonly accountId?: string;
    readonly profiles: readonly ProfileInfo[];
    /**
     * The account's workspaces, as they load: the choice is open and busy
     * meanwhile. Undefined when the list can't be loaded, which the choice says.
     */
    readonly workspaces?: Promise<readonly AccountWorkspace[] | undefined>;
    /** The wizard's "I don't know, sign in first". */
    readonly offerSignInFirst?: boolean;
    /** Checks a typed ID before any login; without one, nothing is checked. */
    readonly check?: (workspaceId: string) => Promise<WorkspaceAccess>;
    readonly openExternal: (url: string) => void;
    /** This step's number in the sign-in; a new profile's name is the next one. */
    readonly step: number;
    readonly totalSteps: number;
}

const TITLE = "Select a workspace";

interface ChoiceItem extends QuickPickItem {
    readonly run?: InputStep;
}

/** A choice for a profile that exists: there is no signing in first. */
export type ExistingProfileChoice = Exclude<WorkspaceChoice, { readonly kind: "signInFirst" }>;

/** The choice on its own, as "Select a workspace" runs it. Throws `CancelledError` when dismissed. */
export async function chooseWorkspace(
    options: Omit<WorkspaceChoiceOptions, "offerSignInFirst" | "step" | "totalSteps"> & {
        readonly profile: string;
    },
    factory?: QuickInputFactory,
): Promise<ExistingProfileChoice> {
    let choice: ExistingProfileChoice | undefined;
    await MultiStepInput.run(
        workspaceChoiceStep({ ...options, step: 1, totalSteps: 2 }, (c) => {
            if (c.kind !== "signInFirst") {
                choice = c;
            }
        }),
        factory,
    );
    if (choice === undefined) {
        throw new Error("The workspace choice ended without a choice");
    }
    return choice;
}

/**
 * The choice as a step, for the sign-in wizard too: the offered profiles
 * (see `offeredProfiles`), then the account's workspaces, then a typed ID or
 * URL, then creating a new profile or, in the wizard, signing in first.
 * `done` gets the choice; the step returns the next one, if any.
 */
export function workspaceChoiceStep(
    options: WorkspaceChoiceOptions,
    done: (choice: WorkspaceChoice) => InputStep | void,
): InputStep {
    return async (input) => {
        const others = offeredProfiles(options);
        const profileItems: ChoiceItem[] = others.map((p) => ({
            label: `Use profile ${p.name}`,
            detail: `Workspace ${p.workspaceId} on ${p.host}, without signing in again`,
            run: async () => done({ kind: "profile", profile: p.name }),
        }));
        /** The items, with the account's workspaces as listed (none while they load). */
        const itemsWith = (listed: readonly AccountWorkspace[] | undefined): ChoiceItem[] => {
            const listItems: ChoiceItem[] = (listed ?? []).map((w) => ({
                label: w.name,
                description: w.id,
                run: async () => done({ kind: "workspace", workspaceId: w.id, fromList: true }),
            }));
            const items: ChoiceItem[] = [];
            for (const group of [profileItems, listItems]) {
                if (group.length > 0) {
                    items.push(...group, { label: "", kind: QuickPickItemKind.Separator });
                }
            }
            if (listed === undefined) {
                // Not selectable: a line that says why the list is missing.
                items.push({
                    label: "Couldn't load the account's workspaces",
                    kind: QuickPickItemKind.Separator,
                });
            }
            items.push({
                label: "Enter a workspace ID or URL…",
                detail: "The number after ?o= in the workspace's URL",
                run: (next) => enterWorkspace(next, options, done),
            });
            if (options.profile !== undefined) {
                items.push({
                    label: "Create a new profile instead…",
                    detail: `Keeps profile ${options.profile} as it is`,
                    run: (next) =>
                        enterWorkspace(next, options, (c) =>
                            c.kind === "workspace"
                                ? (n: MultiStepInput) =>
                                      nameNewProfile(n, options, c.workspaceId, done)
                                : done(c),
                        ),
                });
            }
            if (options.offerSignInFirst) {
                items.push({
                    label: "I don't know, sign in first",
                    detail: "Sign in to the account in the browser, then choose",
                    run: async () => done({ kind: "signInFirst" }),
                });
            }
            return items;
        };
        const profile = options.profile;
        const pick = await input.showQuickPick<ChoiceItem, readonly AccountWorkspace[] | undefined>(
            {
                title: TITLE,
                step: options.step,
                totalSteps: options.totalSteps,
                placeholder:
                    profile !== undefined
                        ? `This updates profile ${profile}`
                        : `${options.host} serves several workspaces: which one?`,
                items: itemsWith([]),
                matchOnDescription: true,
                ...(options.workspaces === undefined
                    ? {}
                    : {
                          loading: {
                              loaded: options.workspaces,
                              withLoaded: itemsWith,
                              // Picked for the user, with a notice, when the list comes back before they've done anything.
                              pickIfUntouched: (listed) => {
                                  const only =
                                      listed === undefined
                                          ? undefined
                                          : soleWorkspace(listed, others);
                                  return only === undefined || profile === undefined
                                      ? undefined
                                      : {
                                            label: only.name,
                                            run: async () => {
                                                void window.showInformationMessage(
                                                    `Using workspace ${only.name} (${only.id}), the only one in the account. This updates profile ${profile}.`,
                                                );
                                                return done({
                                                    kind: "workspace",
                                                    workspaceId: only.id,
                                                    fromList: true,
                                                });
                                            },
                                        };
                              },
                          },
                      }),
            },
        );
        return pick.run;
    };
}

/** A profile the choice offers: it names a workspace, and switching to it needs no login. */
type OfferedProfile = ProfileInfo & { readonly host: string; readonly workspaceId: string };

/**
 * The profiles the choice offers. One with an account_id must be for this
 * account, on any host. One without an account_id must be on this host. A
 * profile with no host, or none that names a workspace, is left out.
 */
function offeredProfiles(options: WorkspaceChoiceOptions): OfferedProfile[] {
    return options.profiles.filter((p): p is OfferedProfile => {
        if (p.name === options.profile || p.host === undefined || p.workspaceId === undefined) {
            return false;
        }
        if (p.accountId !== undefined) {
            return options.accountId !== undefined && p.accountId === options.accountId;
        }
        return hostKey(p.host) === hostKey(options.host);
    });
}

/**
 * The account's only workspace, unless an offered profile already names it:
 * then it's offered like any other, as using that profile needs no login.
 */
function soleWorkspace(
    listed: readonly AccountWorkspace[],
    offered: readonly OfferedProfile[],
): AccountWorkspace | undefined {
    if (listed.length !== 1) {
        return undefined;
    }
    const [only] = listed;
    const named = offered.some((p) => p.workspaceId === only!.id);
    return named ? undefined : only;
}

async function enterWorkspace(
    input: MultiStepInput,
    options: WorkspaceChoiceOptions,
    done: (choice: WorkspaceChoice) => InputStep | void,
): Promise<InputStep | void> {
    const open: QuickInputButton = {
        iconPath: new ThemeIcon("link-external"),
        tooltip: `Open ${options.host} in the browser`,
    };
    const value = await input.showInputBox({
        title: TITLE,
        step: options.step,
        totalSteps: options.totalSteps,
        placeholder: `A workspace ID, or a URL with ?o= from ${options.host} in the browser`,
        buttons: [open],
        onButton: () => options.openExternal(options.host),
        validate: async (v) => parseWorkspace(v, options.host).error,
        // Only once `validate` passes, so the value names a workspace.
        validateOnAccept: async (v) => {
            const id = parseWorkspace(v, options.host).workspaceId!;
            return (await options.check?.(id)) === "denied"
                ? `No access to workspace ${id}`
                : undefined;
        },
    });
    const { workspaceId } = parseWorkspace(value, options.host);
    return done({ kind: "workspace", workspaceId: workspaceId! });
}

async function nameNewProfile(
    input: MultiStepInput,
    options: WorkspaceChoiceOptions,
    workspaceId: string,
    done: (choice: WorkspaceChoice) => InputStep | void,
): Promise<InputStep | void> {
    const taken = new Set(options.profiles.map((p) => p.name));
    const name = await input.showInputBox({
        title: "Enter a name for the new profile",
        step: options.step + 1,
        totalSteps: options.totalSteps,
        placeholder: "Enter a name for the new profile",
        initialValue: `${options.profile}-${workspaceId}`,
        validate: async (value) => {
            if (value.length === 0) {
                return { message: "Profile name cannot be empty", type: "error" };
            }
            if (value.includes(".")) {
                return { message: "Profile name cannot contain dots", type: "error" };
            }
            if (taken.has(value)) {
                return { message: `Profile ${value} already exists`, type: "error" };
            }
            return undefined;
        },
    });
    return done({ kind: "workspace", workspaceId, newProfile: name });
}

/** A workspace ID, typed or in a URL's `?o=` or `?w=` on `host`; or why not. */
function parseWorkspace(
    value: string,
    host: string,
): { readonly workspaceId?: string; readonly error?: string } {
    const v = value.trim();
    if (/^\d+$/.test(v)) {
        return { workspaceId: v };
    }
    if (v === "") {
        return { error: "Type a workspace ID, or paste the workspace's URL" };
    }
    const pasted = hostKey(v);
    if (pasted === undefined || !/[./]/.test(v)) {
        return { error: "A workspace ID is a number, such as 1234567890123456" };
    }
    if (pasted !== hostKey(host)) {
        return { error: `This URL is for ${pasted}, not ${host}` };
    }
    const workspaceId = workspaceIdFromHost(v);
    return workspaceId !== undefined && /^\d+$/.test(workspaceId)
        ? { workspaceId }
        : { error: "This URL names no workspace: it has no ?o= or ?w=" };
}
