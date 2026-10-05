import {Disposable, Event, EventEmitter} from "vscode";
import lodash from "lodash";
import {ConfigModel} from "../configuration/models/ConfigModel";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {StateStorage} from "../vscode-objs/StateStorage";
import {withOnErrorHandler} from "../utils/onErrorDecorator";

const HIDE_KEY = "databricks.bundle.remote.hideHostMismatchWarning";

/** An active environment-vs-target workspace host mismatch. Hostnames only. */
export interface HostMismatch {
    /** The host the remote session is signed in to (the SSH/env host). */
    envHost: string;
    /** The host the selected bundle target deploys to. */
    targetHost: string;
    /** The selected bundle target's name. */
    target: string;
}

function pairKey(m: HostMismatch): string {
    return `${m.envHost}->${m.targetHost}`;
}

/** The user-facing explanation, shared by the warning and the Target tooltip. */
export function describeHostMismatch(m: HostMismatch): string {
    return (
        `This project's "${m.target}" target deploys to ${m.targetHost}, but ` +
        `this remote session is signed in to ${m.envHost}. Bundle commands send ` +
        `${m.envHost}'s credentials to ${m.targetHost}, so validate, deploy and ` +
        `run are likely to fail, and links and run status in the Bundle ` +
        `Resource Explorer point at ${m.envHost}.`
    );
}

/**
 * In Remote SSH mode, tracks whether the selected bundle target's
 * `workspace.host` differs from the host the session is signed in to.
 * {@link onDidDetectNewMismatch} fires once per env→target pair (again only
 * after the hosts have matched in between), skipping pairs hidden with
 * {@link hideWarning}.
 */
export class RemoteTargetHostManager implements Disposable {
    private disposables: Disposable[] = [];
    // Cleared when the hosts match, so a later mismatch warns again.
    private readonly warnedPairs = new Set<string>();
    private _mismatch: HostMismatch | undefined;
    private readonly _onDidChangeMismatch = new EventEmitter<void>();
    readonly onDidChangeMismatch: Event<void> = this._onDidChangeMismatch.event;
    private readonly _onDidDetectNewMismatch = new EventEmitter<HostMismatch>();
    readonly onDidDetectNewMismatch: Event<HostMismatch> =
        this._onDidDetectNewMismatch.event;

    constructor(
        private readonly configModel: ConfigModel,
        private readonly connectionManager: ConnectionManager,
        private readonly stateStorage: StateStorage
    ) {
        const onChange = withOnErrorHandler(() => this.evaluate(), {
            log: true,
            throw: false,
        });
        this.disposables.push(
            this._onDidChangeMismatch,
            this._onDidDetectNewMismatch,
            this.configModel.onDidChangeTarget(onChange),
            // An edit to the target's workspace.host in databricks.yml.
            this.configModel.onDidChangeKey("host")(onChange),
            this.connectionManager.onDidChangeState((state) =>
                state === "CONNECTED" ? onChange() : undefined
            )
        );
    }

    /** The active mismatch, or undefined when hosts match / state is unknown. */
    public get mismatch(): HostMismatch | undefined {
        return this._mismatch;
    }

    /** Stop warning about this env→target pair in this workspace. */
    public async hideWarning(mismatch: HostMismatch): Promise<void> {
        const pair = pairKey(mismatch);
        const hidden = this.stateStorage.get(HIDE_KEY);
        if (!hidden.includes(pair)) {
            await this.stateStorage.set(HIDE_KEY, [...hidden, pair]);
        }
    }

    private setMismatch(mismatch: HostMismatch | undefined) {
        if (lodash.isEqual(this._mismatch, mismatch)) {
            return;
        }
        this._mismatch = mismatch;
        this._onDidChangeMismatch.fire();
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
            this.warnedPairs.clear();
            this.setMismatch(undefined);
            return;
        }

        const mismatch: HostMismatch = {
            envHost: envHost.hostname,
            targetHost: targetHostUrl.hostname,
            target,
        };
        this.setMismatch(mismatch);

        const pair = pairKey(mismatch);
        if (
            this.warnedPairs.has(pair) ||
            this.stateStorage.get(HIDE_KEY).includes(pair)
        ) {
            return;
        }
        this.warnedPairs.add(pair);
        this._onDidDetectNewMismatch.fire(mismatch);
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
