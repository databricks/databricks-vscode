import {commands, Disposable, Event, EventEmitter, window} from "vscode";
import {ConfigModel} from "../configuration/models/ConfigModel";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {WorkspaceFolderManager} from "../vscode-objs/WorkspaceFolderManager";
import {StateStorage} from "../vscode-objs/StateStorage";
import {Telemetry} from "../telemetry";
import {
    BundleRemoteHostMismatchWarningAction,
    Events,
} from "../telemetry/constants";
import {withOnErrorHandler} from "../utils/onErrorDecorator";

export const SWITCH_TARGET_LABEL = "Switch target";
export const DONT_WARN_FOR_TARGET_LABEL = "Don't warn for this target";
const SELECT_TARGET_COMMAND = "databricks.connection.bundle.selectTarget";
const HIDE_KEY = "databricks.bundle.remote.hideHostMismatchWarning";

/**
 * The surfaces {@link RemoteTargetHostManager} needs, behind one seam so the
 * logic is unit-testable. The real implementation delegates to `window` /
 * `commands`. Mirrors {@link BundleEnginePrompter}.
 */
export interface RemoteHostMismatchPrompter {
    showWarningMessage: (typeof window)["showWarningMessage"];
    executeCommand: (typeof commands)["executeCommand"];
}

/** An active environment-vs-target workspace host mismatch. Hostnames only. */
export interface HostMismatch {
    /** The host the extension is authenticated against (the SSH/env host). */
    envHost: string;
    /** The host the selected bundle target deploys to. */
    targetHost: string;
    /** The selected bundle target's name. */
    target: string;
}

function pairKey(m: HostMismatch): string {
    return `${m.envHost}->${m.targetHost}`;
}

/**
 * In Databricks Remote SSH mode, warns when the selected bundle target's
 * `workspace.host` differs from the host the extension is authenticated against
 * (the environment/SSH host, resolved by
 * {@link ConnectionManager.connectFromEnvironment}). On a mismatch the ambient
 * credentials are still applied to the target config, so the Bundle Resource
 * Explorer and any deploy silently use the environment host, not the target's -
 * a confusing state this surfaces explicitly.
 *
 * It owns the mismatch state and exposes it via {@link mismatch} /
 * {@link onDidChangeMismatch} so the Configuration view can render a persistent
 * badge on the Target node (the toast is transient). The toast shows at most
 * once per session per distinct environment→target host pair; "Don't warn for
 * this target" persists a per-pair opt-out for the workspace via
 * {@link StateStorage}, so an intentional cross-workspace deploy stops nagging
 * while a genuinely new mismatch still warns.
 *
 * Reactive with no command trigger, mirroring {@link BundleEngineManager}. It
 * only *reads* {@link ConnectionManager.databricksWorkspace} (a plain getter)
 * and {@link ConfigModel.get} (its own mutex), so it never touches the
 * {@link RemoteBundleInitializer}'s auth mutexes.
 */
export class RemoteTargetHostManager implements Disposable {
    private disposables: Disposable[] = [];
    // The pair we last showed the toast for this session. Reset to undefined
    // when the mismatch clears, so a later recurrence re-warns.
    private lastWarnedPair: string | undefined;
    private _mismatch: HostMismatch | undefined;
    private readonly onDidChangeMismatchEmitter = new EventEmitter<void>();
    public readonly onDidChangeMismatch: Event<void> =
        this.onDidChangeMismatchEmitter.event;

    constructor(
        private readonly configModel: ConfigModel,
        private readonly connectionManager: ConnectionManager,
        private readonly workspaceFolderManager: WorkspaceFolderManager,
        private readonly stateStorage: StateStorage,
        private readonly telemetry: Telemetry,
        private readonly prompter: RemoteHostMismatchPrompter = {
            showWarningMessage: window.showWarningMessage,
            executeCommand: commands.executeCommand,
        }
    ) {
        const onChange = withOnErrorHandler(() => this.evaluate(), {
            log: true,
            throw: false,
        });
        this.disposables.push(
            this.configModel.onDidChangeTarget(onChange),
            this.connectionManager.onDidChangeState((state) =>
                state === "CONNECTED" ? onChange() : undefined
            ),
            this.workspaceFolderManager.onDidChangeActiveProjectFolder(onChange)
        );
    }

    /** The active mismatch, or undefined when hosts match / state is unknown. */
    public get mismatch(): HostMismatch | undefined {
        return this._mismatch;
    }

    private setMismatch(mismatch: HostMismatch | undefined) {
        this._mismatch = mismatch;
        if (mismatch === undefined) {
            // Reset the session latch so a later recurrence re-warns.
            this.lastWarnedPair = undefined;
        }
        this.onDidChangeMismatchEmitter.fire();
    }

    private async evaluate(): Promise<void> {
        const envHost =
            this.connectionManager.databricksWorkspace?.authProvider.host;
        const target = this.configModel.target;
        // Not connected yet, or no target resolved: nothing to compare. The
        // onDidChangeState("CONNECTED") / onDidChangeTarget subscriptions
        // re-evaluate once both land.
        if (envHost === undefined || target === undefined) {
            this.setMismatch(undefined);
            return;
        }

        const targetHostUrl = await this.configModel.get("host");
        // A target with no (or an invalid) workspace.host: the "Invalid host for
        // target" path in BundleTargetComponent owns that state, so we don't
        // warn on top of it.
        if (targetHostUrl === undefined) {
            this.setMismatch(undefined);
            return;
        }

        // Re-read after the await: a folder change or reconnect may have moved a
        // host while get("host") resolved. Bail on stale input rather than
        // warning about a pairing that no longer holds.
        const currentEnvHost =
            this.connectionManager.databricksWorkspace?.authProvider.host;
        if (
            this.configModel.target !== target ||
            currentEnvHost?.toString() !== envHost.toString()
        ) {
            return;
        }

        if (envHost.hostname === targetHostUrl.hostname) {
            this.setMismatch(undefined);
            return;
        }

        const mismatch: HostMismatch = {
            envHost: envHost.hostname,
            targetHost: targetHostUrl.hostname,
            target,
        };
        this.setMismatch(mismatch);
        await this.warn(mismatch);
    }

    private async warn(mismatch: HostMismatch): Promise<void> {
        const pair = pairKey(mismatch);
        if (
            pair === this.lastWarnedPair ||
            this.stateStorage.get(HIDE_KEY).includes(pair)
        ) {
            return;
        }
        this.lastWarnedPair = pair;

        const choice = await this.prompter.showWarningMessage(
            `This project's "${mismatch.target}" target deploys to ${mismatch.targetHost}, ` +
                `but you're connected to ${mismatch.envHost} (the workspace you opened this ` +
                `remote session in). The Bundle Resource Explorer and any deploy will use ` +
                `${mismatch.envHost}, not ${mismatch.targetHost}.`,
            SWITCH_TARGET_LABEL,
            DONT_WARN_FOR_TARGET_LABEL
        );

        let action: BundleRemoteHostMismatchWarningAction = "dismissed";
        if (choice === SWITCH_TARGET_LABEL) {
            action = "switch-target";
            await this.prompter.executeCommand(SELECT_TARGET_COMMAND);
        } else if (choice === DONT_WARN_FOR_TARGET_LABEL) {
            action = "hidden";
            const hidden = this.stateStorage.get(HIDE_KEY);
            if (!hidden.includes(pair)) {
                await this.stateStorage.set(HIDE_KEY, [...hidden, pair]);
            }
        }

        this.telemetry.recordEvent(Events.BUNDLE_REMOTE_HOST_MISMATCH_WARNING, {
            action,
        });
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
