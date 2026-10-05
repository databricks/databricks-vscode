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
export const DONT_WARN_FOR_TARGET_LABEL = "Don't warn for this target";
const SELECT_TARGET_COMMAND = "databricks.connection.bundle.selectTarget";

/** The VS Code surfaces the warning uses, injectable for tests. */
export interface RemoteHostMismatchPrompter {
    showWarningMessage: (typeof window)["showWarningMessage"];
    executeCommand: (typeof commands)["executeCommand"];
}

/**
 * Shows the warning {@link RemoteTargetHostManager} asks for on a new host
 * mismatch, and runs the action the user picks.
 */
export class RemoteTargetHostCommands implements Disposable {
    private disposables: Disposable[] = [];

    constructor(
        private readonly manager: Pick<
            RemoteTargetHostManager,
            "onDidDetectNewMismatch" | "hideWarning"
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

    private async showWarning(mismatch: HostMismatch): Promise<void> {
        const choice = await this.prompter.showWarningMessage(
            describeHostMismatch(mismatch),
            SWITCH_TARGET_LABEL,
            DONT_WARN_FOR_TARGET_LABEL
        );

        let action: BundleRemoteHostMismatchWarningAction = "dismissed";
        if (choice === SWITCH_TARGET_LABEL) {
            action = "switch-target";
            await this.prompter.executeCommand(SELECT_TARGET_COMMAND);
        } else if (choice === DONT_WARN_FOR_TARGET_LABEL) {
            action = "hidden";
            await this.manager.hideWarning(mismatch);
        }

        this.telemetry.recordEvent(Events.BUNDLE_REMOTE_HOST_MISMATCH_WARNING, {
            action,
        });
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
