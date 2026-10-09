import {Disposable, Event, EventEmitter} from "vscode";
import lodash from "lodash";
import {ConfigModel} from "../configuration/models/ConfigModel";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {withOnErrorHandler} from "../utils/onErrorDecorator";
import {describePausedReason, PausedReason} from "./BundleAuthReason";

/**
 * Why the selected bundle target's commands are paused in Remote SSH mode. The
 * credential guard refuses the session's credentials for this target; this is
 * what the Target row surfaces.
 */
export interface PausedTarget {
    /** The selected bundle target's name. */
    target: string;
    /** Which guard rule paused it. */
    reason: PausedReason;
    /** The host the remote session is signed in to (the SSH/env host). */
    envHost: string;
    /** The host the target deploys to — only when `reason` is `host-mismatch`. */
    targetHost?: string;
}

/** The user-facing explanation, shared by the error and the Target tooltip. */
export function describePausedTarget(p: PausedTarget): string {
    if (p.reason === "host-mismatch" && p.targetHost !== undefined) {
        return (
            `This project's "${p.target}" target deploys to ${p.targetHost}, ` +
            `but this remote session is signed in to ${p.envHost}. Bundle ` +
            `commands for this target are paused so ${p.envHost}'s credentials ` +
            `aren't sent to ${p.targetHost}. Switch to a target that deploys to ` +
            `${p.envHost} to use them.`
        );
    }
    return (
        `Bundle commands for the "${p.target}" target are paused because ` +
        `${describePausedReason(
            p.reason
        )}. Switch to a target that deploys to ` +
        `${p.envHost} to use this session's credentials.`
    );
}

/**
 * In Remote SSH mode, tracks whether the selected bundle target's bundle
 * commands are paused by the ConfigModel credential guard — either because its
 * `workspace.host` differs from the session's host, or because the guard can't
 * vouch for where the CLI would send the credentials (a profile, a `${…}`
 * variable, a host split across files, an unparseable host, an absent target,
 * or an unsupported include glob). This surfaces that state on the Target row.
 */
export class RemoteTargetHostManager implements Disposable {
    private disposables: Disposable[] = [];
    private _paused: PausedTarget | undefined;
    private readonly _onDidChangePaused = new EventEmitter<void>();
    readonly onDidChangePaused: Event<void> = this._onDidChangePaused.event;

    constructor(
        private readonly configModel: ConfigModel,
        private readonly connectionManager: ConnectionManager
    ) {
        this.disposables.push(
            this._onDidChangePaused,
            this.configModel.onDidChangeTarget(() => this.reevaluate()),
            // An edit to the target's workspace.host in databricks.yml.
            this.configModel.onDidChangeKey("host")(() => this.reevaluate()),
            // Every state: a failed reconnect leaves no session host to compare.
            this.connectionManager.onDidChangeState(() => this.reevaluate())
        );
    }

    /** The active paused state, or undefined when the target runs normally. */
    public get paused(): PausedTarget | undefined {
        return this._paused;
    }

    private setPaused(paused: PausedTarget | undefined) {
        if (lodash.isEqual(this._paused, paused)) {
            return;
        }
        this._paused = paused;
        this._onDidChangePaused.fire();
    }

    private readonly reevaluate = withOnErrorHandler(
        async () => {
            try {
                await this.evaluate();
            } catch (e) {
                // Don't leave a paused state from a previous evaluation showing.
                this.setPaused(undefined);
                throw e;
            }
        },
        {log: true, throw: false}
    );

    private async evaluate(): Promise<void> {
        const envHost =
            this.connectionManager.databricksWorkspace?.authProvider.host;
        const target = this.configModel.target;
        // Not connected, or no target resolved: nothing to compare. The
        // state / target subscriptions re-evaluate once both land.
        if (envHost === undefined || target === undefined) {
            this.setPaused(undefined);
            return;
        }

        // Read the host the same way the credential guard does, so the UI and
        // the guard always agree on whether the target is paused.
        const resolution =
            await this.configModel.getTargetWorkspaceHost(target);

        // Re-read after the await: a folder change or reconnect may have moved a
        // host while getTargetWorkspaceHost resolved. Bail on stale input rather
        // than reporting a pairing that no longer holds.
        const currentEnvHost =
            this.connectionManager.databricksWorkspace?.authProvider.host;
        if (
            this.configModel.target !== target ||
            currentEnvHost?.toString() !== envHost.toString()
        ) {
            return;
        }

        // A target with no host of its own uses the session host, so it runs
        // normally — not paused.
        if (resolution.kind === "session") {
            this.setPaused(undefined);
            return;
        }
        // An explicit host only pauses when it differs from the session's.
        if (resolution.kind === "host") {
            if (resolution.host.hostname === envHost.hostname) {
                this.setPaused(undefined);
                return;
            }
            this.setPaused({
                target,
                reason: "host-mismatch",
                envHost: envHost.hostname,
                targetHost: resolution.host.hostname,
            });
            return;
        }
        // Every other case the guard refuses: show the specific reason.
        this.setPaused({
            target,
            reason: resolution.reason,
            envHost: envHost.hostname,
        });
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
