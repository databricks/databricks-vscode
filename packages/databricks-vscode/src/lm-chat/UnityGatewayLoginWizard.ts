import {QuickPickItem, QuickPickItemKind, window} from "vscode";
import {CliWrapper, ConfigEntry} from "../cli/CliWrapper";
import {
    AuthProvider,
    ProfileAuthProvider,
} from "../configuration/auth/AuthProvider";
import {
    humaniseSdkAuthType,
    listProfiles,
    LoginWizard,
} from "../configuration/LoginWizard";

type GatewayProfileQuickPickItem = QuickPickItem & {profile?: string};

/**
 * Workspace profiles to pick the Unity Gateway workspace from, with the current
 * one first and then the CLI's default, followed by an entry that signs in to
 * another workspace.
 */
export function gatewayProfileQuickPickItems(
    profiles: ConfigEntry[],
    currentProfile?: string
): GatewayProfileQuickPickItem[] {
    const rank = (profile: ConfigEntry) =>
        profile.name === currentProfile ? 2 : profile.isDefault ? 1 : 0;
    const items: GatewayProfileQuickPickItem[] = profiles
        // Account-level profiles have no workspace to serve models from.
        .filter(
            (profile) =>
                profile.accountId === undefined ||
                profile.workspaceId !== undefined
        )
        .sort((a, b) => rank(b) - rank(a))
        .map((profile) => ({
            label: profile.name,
            description: profile.host?.hostname,
            detail: [
                humaniseSdkAuthType(profile.authType),
                profile.isDefault ? "CLI default profile" : undefined,
                profile.name === currentProfile
                    ? "Current Unity Gateway workspace"
                    : undefined,
            ]
                .filter((part) => part)
                .join(" · "),
            profile: profile.name,
        }));
    if (items.length > 0) {
        items.push({label: "", kind: QuickPickItemKind.Separator});
    }
    items.push({
        label: "Sign in to another workspace",
        detail: "Enter a workspace URL and choose how to authenticate",
    });
    return items;
}

export class UnityGatewayLoginWizard {
    static async run(
        cli: CliWrapper,
        current?: AuthProvider
    ): Promise<AuthProvider | undefined> {
        const items = gatewayProfileQuickPickItems(
            await listProfiles(cli),
            current?.toJSON().profile
        );
        const pick = items.some((item) => item.profile !== undefined)
            ? await window.showQuickPick(items, {
                  title: "Choose a Unity Gateway workspace",
                  placeHolder: "Chat uses the models of the workspace you pick",
                  ignoreFocusOut: true,
              })
            : items[0];
        if (pick === undefined) {
            return;
        }
        if (pick.profile === undefined) {
            return LoginWizard.run(cli);
        }
        let authProvider: AuthProvider;
        try {
            authProvider = await ProfileAuthProvider.from(pick.profile, cli);
        } catch (e) {
            const reason = e instanceof Error ? `: ${e.message}` : "";
            void window.showErrorMessage(
                `Can't use profile '${pick.profile}'${reason}`
            );
            return;
        }
        return (await authProvider.check()) ? authProvider : undefined;
    }
}
