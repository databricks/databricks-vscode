import {commands} from "vscode";

/**
 * Recovers the command that reveals a `LogOutputChannel` on hosts that register
 * the channel under a different id than the extension host believes it has.
 *
 * See ./README.md for why this is needed and why the check is shaped as a
 * capability probe rather than a fork-name check.
 */

/** Mirrors the character class the extension host strips from channel names. */
const ILLEGAL_CHANNEL_ID_CHARS = /[\\/:*?"<>|]/g;

const REVEAL_COMMAND_PREFIX = "workbench.action.output.show.";

/**
 * The id the extension host derives locally for a log output channel. It never
 * round-trips through the workbench, which is what allows it to disagree with
 * the id the channel is actually registered under.
 */
export function getLogChannelId(extensionId: string, name: string): string {
    return `${extensionId}.${name.replace(ILLEGAL_CHANNEL_ID_CHARS, "")}`;
}

/**
 * Picks the reveal command for `channelId` out of `allCommands`, but only when
 * the host registered the channel under a *different* id than `channelId`.
 *
 * Returns undefined when the ids agree (plain `.show()` already works) or when
 * no single candidate is conclusive — callers fall back to `.show()`.
 */
export function pickRevealCommand(
    allCommands: readonly string[],
    channelId: string
): string | undefined {
    const prefix = `${REVEAL_COMMAND_PREFIX}${channelId}`.toLowerCase();
    const candidates: string[] = [];

    for (const command of allCommands) {
        const lowerCased = command.toLowerCase();
        if (lowerCased === prefix) {
            // The ids agree, so `.show()` reveals the channel. Never shadow it.
            return undefined;
        }
        if (!lowerCased.startsWith(prefix)) {
            continue;
        }
        // A host-added scope is a single extra dot-segment (".workspaceId-<id>").
        // Requiring the leading dot is what keeps a *longer channel name* whose
        // id merely starts with ours out of the candidate set.
        if (/^\.[^.]+$/.test(command.slice(prefix.length))) {
            candidates.push(command);
        }
    }

    if (candidates.length === 1) {
        return candidates[0];
    }
    // Ambiguous: prefer the known workspace-scope shape, and otherwise give up
    // rather than reveal some unrelated channel of ours.
    const workspaceScoped = candidates.filter((command) =>
        command.slice(prefix.length).startsWith(".workspaceId-")
    );
    return workspaceScoped.length === 1 ? workspaceScoped[0] : undefined;
}

export async function findRevealCommand(
    extensionId: string,
    name: string,
    getCommands: () => Thenable<string[]> = () => commands.getCommands(true)
): Promise<string | undefined> {
    return pickRevealCommand(
        await getCommands(),
        getLogChannelId(extensionId, name)
    );
}
