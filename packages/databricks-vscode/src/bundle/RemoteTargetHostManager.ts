import {Disposable, Event, EventEmitter} from "vscode";
import lodash from "lodash";
import {ConfigModel} from "../configuration/models/ConfigModel";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {withOnErrorHandler} from "../utils/onErrorDecorator";

/** An active environment-vs-target workspace host mismatch. Hostnames only. */
export interface HostMismatch {
    /** The host the remote session is signed in to (the SSH/env host). */
    envHost: string;
    /** The host the selected bundle target deploys to. */
    targetHost: string;
    /** The selected bundle target's name. */
    target: string;
}

/** The user-facing explanation, shared by the warning and the Target tooltip. */
export function describeHostMismatch(m: HostMismatch): string {
    return (
        `This project's "${m.target}" target deploys to ${m.targetHost}, but ` +
        `this remote session is signed in to ${m.envHost}. Bundle commands for ` +
        `this target are paused so ${m.envHost}'s credentials aren't sent to ` +
        `${m.targetHost}. Switch to a target that deploys to ${m.envHost} to ` +
        `use them.`
    );
}

/**
 * In Remote SSH mode, tracks whether the selected bundle target's
 * `workspace.host` differs from the host the session is signed in to. The
 * session's credentials only authenticate against the session's host, so a
 * target on another host has its bundle commands paused (the ConfigModel guard
 * refuses the credentials); this just surfaces that state on the Target row.
 */
export class RemoteTargetHostManager implements Disposable {
    private disposables: Disposable[] = [];
    private _mismatch: HostMismatch | undefined;
    private readonly _onDidChangeMismatch = new EventEmitter<void>();
    readonly onDidChangeMismatch: Event<void> = this._onDidChangeMismatch.event;

    constructor(
        private readonly configModel: ConfigModel,
        private readonly connectionManager: ConnectionManager
    ) {
        this.disposables.push(
            this._onDidChangeMismatch,
            this.configModel.onDidChangeTarget(() => this.reevaluate()),
            // An edit to the target's workspace.host in databricks.yml.
            this.configModel.onDidChangeKey("host")(() => this.reevaluate()),
            // Every state: a failed reconnect leaves no session host to compare.
            this.connectionManager.onDidChangeState(() => this.reevaluate())
        );
    }

    /** The active mismatch, or undefined when hosts match / state is unknown. */
    public get mismatch(): HostMismatch | undefined {
        return this._mismatch;
    }

    private setMismatch(mismatch: HostMismatch | undefined) {
        if (lodash.isEqual(this._mismatch, mismatch)) {
            return;
        }
        this._mismatch = mismatch;
        this._onDidChangeMismatch.fire();
    }

    private readonly reevaluate = withOnErrorHandler(
        async () => {
            try {
                await this.evaluate();
            } catch (e) {
                // Don't leave a mismatch from a previous evaluation showing.
                this.setMismatch(undefined);
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
            this.setMismatch(undefined);
            return;
        }

        // Read the host the same way the credential guard does, so the UI and
        // the guard always agree on where the target points.
        const resolution =
            await this.configModel.getTargetWorkspaceHost(target);

        // Re-read after the await: a folder change or reconnect may have moved a
        // host while getTargetWorkspaceHost resolved. Bail on stale input rather
        // than warning about a pairing that no longer holds.
        const currentEnvHost =
            this.connectionManager.databricksWorkspace?.authProvider.host;
        if (
            this.configModel.target !== target ||
            currentEnvHost?.toString() !== envHost.toString()
        ) {
            return;
        }

        // Only an explicit, parseable host can mismatch. A target with no host
        // uses the session host (safe); an unparseable one is owned by the
        // "Invalid host for target" path in BundleTargetComponent, so we don't
        // warn on top of either.
        if (
            resolution.kind !== "host" ||
            resolution.host.hostname === envHost.hostname
        ) {
            this.setMismatch(undefined);
            return;
        }

        this.setMismatch({
            envHost: envHost.hostname,
            targetHost: resolution.host.hostname,
            target,
        });
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
