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

const SWITCH = "Switch to Pre-Release";
const RELEASE_NOTES = "Release Notes";
const DONT_SHOW_AGAIN = "Don't show again";
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
 * the bundle connection is up. Shown once in each window until the user
 * chooses "Don't show again" or switches.
 */
export class PreReleaseInvitationManager implements Disposable {
    private readonly subscription: Disposable;
    private timer?: ReturnType<typeof setTimeout>;
    private shownInWindow = false;

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
            this.shownInWindow ||
            this.stateStorage.get("databricks.prereleaseInvitation.hidden")
        ) {
            return;
        }
        this.shownInWindow = true;
        // Shown once in this window, so the connection no longer matters.
        this.subscription.dispose();
        this.record("shown");

        const choice = await window.showInformationMessage(
            "Try v3 of the Databricks extension as a pre-release. Access Unity Gateway models in VS Code Chat and a redesigned sidebar. You can switch back to v2 anytime.",
            SWITCH,
            RELEASE_NOTES,
            DONT_SHOW_AGAIN
        );
        switch (choice) {
            case SWITCH:
                await this.switchToPreRelease();
                return;
            case RELEASE_NOTES:
                this.record("releaseNotes");
                await UrlUtils.openExternal(RELEASE_NOTES_URL);
                return;
            case DONT_SHOW_AGAIN:
                this.record("dontShowAgain");
                await this.hide();
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
        // Someone who switches back to version 2 isn't invited again.
        await this.hide();
        const choice = await window.showInformationMessage(
            "Reload the window to finish switching to version 3.",
            RELOAD_WINDOW
        );
        if (choice === RELOAD_WINDOW) {
            await commands.executeCommand("workbench.action.reloadWindow");
        }
    }

    private async hide() {
        await this.stateStorage.set(
            "databricks.prereleaseInvitation.hidden",
            true
        );
    }

    private record(answer: PreReleaseInvitationAnswer) {
        this.telemetry.recordEvent(Events.PRERELEASE_INVITATION, {answer});
    }

    dispose() {
        clearTimeout(this.timer);
        this.subscription.dispose();
    }
}
