import * as semver from "semver";
import {commands, env, version as vscodeVersion, window} from "vscode";
import type {Disposable} from "vscode";
import {logging} from "@databricks/sdk-experimental";
import type {ConnectionManager} from "../configuration/ConnectionManager";
import {Loggers} from "../logger";
import type {Telemetry} from "../telemetry";
import {Events} from "../telemetry/constants";
import type {PreReleaseInvitationAnswer} from "../telemetry/constants";
import type {StateStorage} from "../vscode-objs/StateStorage";
import {UrlUtils} from "../utils";

const logger = logging.NamedLogger.getOrCreate(Loggers.Extension);
const EXTENSION_ID = "databricks.databricks";
// Lets a sign-in or another prompt settle before this one appears.
export const SHOW_DELAY_MS = 5000;
// Not offered from 2026-12-03 (UTC).
const OFFERED_UNTIL = Date.UTC(2026, 11, 3);
// Version 3 needs VS Code's engine 1.128.0.
const MIN_VSCODE_VERSION = "1.128.0";
// Forks (Cursor, VSCodium, ...) have their own URI schemes and no version 3.
const VS_CODE_URI_SCHEMES = ["vscode", "vscode-insiders"];

const SWITCH = "Switch to Pre-Release Version";
const RELEASE_NOTES = "Release Notes";
const RELOAD_WINDOW = "Reload Window";
const RELEASE_NOTES_URL =
    "https://github.com/databricks/databricks-vscode/blob/release-v3.1.0/packages/databricks-vscode/CHANGELOG.md";

export function isInvitationHost(host: {
    uriScheme: string;
    remoteName: string | undefined;
    vscodeVersion: string;
}): boolean {
    // coerce drops a build suffix such as "-insider".
    const version = semver.coerce(host.vscodeVersion);
    return (
        host.remoteName === undefined &&
        VS_CODE_URI_SCHEMES.includes(host.uriScheme) &&
        version !== null &&
        semver.gte(version, MIN_VSCODE_VERSION)
    );
}

/**
 * Offers the version 3 pre-release to signed-in users of local VS Code, once
 * the bundle connection is up. Shown once, whatever the answer.
 */
export class PreReleaseInvitationManager implements Disposable {
    private readonly subscription: Disposable;
    private timer?: ReturnType<typeof setTimeout>;

    constructor(
        private readonly connection: Pick<
            ConnectionManager,
            "state" | "onDidChangeState"
        >,
        private readonly stateStorage: Pick<StateStorage, "get" | "set">,
        private readonly telemetry: Pick<Telemetry, "recordEvent">
    ) {
        this.subscription = connection.onDidChangeState((state) =>
            this.onState(state)
        );
        this.onState(connection.state);
    }

    private onState(state: string) {
        clearTimeout(this.timer);
        this.timer =
            state === "CONNECTED"
                ? setTimeout(() => {
                      this.showIfDue().catch((e) =>
                          logger.error(
                              "Failed to show the pre-release invitation",
                              e
                          )
                      );
                  }, SHOW_DELAY_MS)
                : undefined;
    }

    async showIfDue(): Promise<void> {
        if (
            this.connection.state !== "CONNECTED" ||
            !isInvitationHost({
                uriScheme: env.uriScheme,
                remoteName: env.remoteName,
                vscodeVersion,
            }) ||
            Date.now() >= OFFERED_UNTIL ||
            this.stateStorage.get("databricks.prereleaseInvitation.shown")
        ) {
            return;
        }
        // Saved before the prompt, so closing it still counts as the showing.
        await this.stateStorage.set(
            "databricks.prereleaseInvitation.shown",
            true
        );
        // Shown once, so the connection no longer matters.
        this.subscription.dispose();
        this.record("shown");

        const choice = await window.showInformationMessage(
            "Version 3 of the Databricks extension is available as a pre-release, with Unity Gateway models in VS Code Chat and a redesigned sidebar. You can switch back to version 2 at any time.",
            SWITCH,
            RELEASE_NOTES
        );
        switch (choice) {
            case SWITCH:
                await this.switchToPreRelease();
                return;
            case RELEASE_NOTES:
                this.record("releaseNotes");
                await UrlUtils.openExternal(RELEASE_NOTES_URL);
                return;
            default:
                this.record("dismissed");
        }
    }

    private async switchToPreRelease() {
        try {
            await commands.executeCommand(
                "workbench.extensions.installExtension",
                EXTENSION_ID,
                {installPreReleaseVersion: true}
            );
        } catch (e) {
            logger.error(
                "Failed to switch to the pre-release of the Databricks extension",
                e
            );
            this.record("switchFailed");
            await window.showErrorMessage(
                "Couldn't switch to the pre-release of the Databricks extension. See the Databricks Logs for details."
            );
            return;
        }
        this.record("switch");
        const choice = await window.showInformationMessage(
            "Reload the window to finish switching to version 3.",
            RELOAD_WINDOW
        );
        if (choice === RELOAD_WINDOW) {
            await commands.executeCommand("workbench.action.reloadWindow");
        }
    }

    private record(answer: PreReleaseInvitationAnswer) {
        this.telemetry.recordEvent(Events.PRERELEASE_INVITATION, {answer});
    }

    dispose() {
        clearTimeout(this.timer);
        this.subscription.dispose();
    }
}
