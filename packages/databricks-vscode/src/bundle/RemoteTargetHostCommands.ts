import {commands, Disposable, window} from "vscode";
import {Telemetry} from "../telemetry";
import {
    BundleRemoteHostMismatchWarningAction,
    Events,
} from "../telemetry/constants";
import {withOnErrorHandler} from "../utils/onErrorDecorator";
import {
    describeHostMismatch,
    HostMismatch,
    RemoteTargetHostManager,
} from "./RemoteTargetHostManager";

export const SWITCH_TARGET_LABEL = "Switch target";
export const ALLOW_LABEL = "Use session credentials";
export const REVOKE_LABEL = "Stop using session credentials";
const SELECT_TARGET_COMMAND = "databricks.connection.bundle.selectTarget";

/** The VS Code surfaces the warning uses, injectable for tests. */
export interface RemoteHostMismatchPrompter {
    showWarningMessage: (typeof window)["showWarningMessage"];
    executeCommand: (typeof commands)["executeCommand"];
}

/**
 * The host-mismatch warning: shown when {@link RemoteTargetHostManager} finds a
 * new disallowed mismatch, and from the Target row via
 * {@link reviewHostMismatch}. Runs the action the user picks.
 */
export class RemoteTargetHostCommands implements Disposable {
    private disposables: Disposable[] = [];

    constructor(
        private readonly manager: Pick<
            RemoteTargetHostManager,
            | "mismatch"
            | "onDidDetectNewMismatch"
            | "setSessionCredentialsAllowed"
        >,
        private readonly telemetry: Telemetry,
        private readonly prompter: RemoteHostMismatchPrompter = {
            showWarningMessage: window.showWarningMessage,
            executeCommand: commands.executeCommand,
        }
    ) {
        this.disposables.push(
            this.manager.onDidDetectNewMismatch(
                withOnErrorHandler((m: HostMismatch) => this.showWarning(m), {
                    log: true,
                    throw: false,
                })
            )
        );
    }

    /** `databricks.bundle.remote.reviewHostMismatch`, from the Target row. */
    async reviewHostMismatch(): Promise<void> {
        const mismatch = this.manager.mismatch;
        if (mismatch !== undefined) {
            await this.showWarning(mismatch);
        }
    }

    private async showWarning(mismatch: HostMismatch): Promise<void> {
        const toggleLabel = mismatch.allowed ? REVOKE_LABEL : ALLOW_LABEL;
        const choice = await this.prompter.showWarningMessage(
            describeHostMismatch(mismatch),
            SWITCH_TARGET_LABEL,
            toggleLabel
        );

        let action: BundleRemoteHostMismatchWarningAction = "dismissed";
        if (choice === SWITCH_TARGET_LABEL) {
            action = "switch-target";
        } else if (choice === toggleLabel) {
            action = mismatch.allowed ? "revoked" : "allowed";
        }
        // Before the follow-up, which can wait on a quick pick or the CLI.
        this.telemetry.recordEvent(Events.BUNDLE_REMOTE_HOST_MISMATCH_WARNING, {
            action,
        });

        if (action === "switch-target") {
            await this.prompter.executeCommand(SELECT_TARGET_COMMAND);
        } else if (action !== "dismissed") {
            await this.manager.setSessionCredentialsAllowed(
                mismatch,
                action === "allowed"
            );
        }
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
