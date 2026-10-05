import {Disposable, Event, EventEmitter} from "vscode";
import lodash from "lodash";
import {ConfigModel} from "../configuration/models/ConfigModel";
import {ConnectionManager} from "../configuration/ConnectionManager";
import {StateStorage} from "../vscode-objs/StateStorage";
import {withOnErrorHandler} from "../utils/onErrorDecorator";

const ALLOWED_KEY = "databricks.bundle.remote.allowedHostMismatches";

/** An active environment-vs-target workspace host mismatch. Hostnames only. */
export interface HostMismatch {
    /** The host the remote session is signed in to (the SSH/env host). */
    envHost: string;
    /** The host the selected bundle target deploys to. */
    targetHost: string;
    /** The selected bundle target's name. */
    target: string;
    /** Whether the user allowed sending the session's credentials there. */
    allowed: boolean;
}

function pairKey(envHost: string, targetHost: string): string {
    return `${envHost}->${targetHost}`;
}

/** The user-facing explanation, shared by the warning and the Target tooltip. */
export function describeHostMismatch(m: HostMismatch): string {
    const intro =
        `This project's "${m.target}" target deploys to ${m.targetHost}, but ` +
        `this remote session is signed in to ${m.envHost}.`;
    if (m.allowed) {
        return (
            `${intro} You allowed sending ${m.envHost}'s credentials to ` +
            `${m.targetHost}, so bundle commands may fail there, and links and ` +
            `run status in the Bundle Resource Explorer point at ${m.envHost}.`
        );
    }
    return (
        `${intro} Bundle commands for this target are paused so ` +
        `${m.envHost}'s credentials aren't sent to ${m.targetHost}. Allowing ` +
        `it applies to every target in this workspace that deploys there.`
    );
}

/**
 * In Remote SSH mode, tracks whether the selected bundle target's
 * `workspace.host` differs from the host the session is signed in to, and which
 * such hosts the user allowed the session's credentials to be sent to.
 * {@link onDidDetectNewMismatch} fires once per disallowed env→target pair
 * (again only after the hosts have matched in between).
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
    private readonly _onDidChangeAllowedHosts = new EventEmitter<void>();
    readonly onDidChangeAllowedHosts: Event<void> =
        this._onDidChangeAllowedHosts.event;

    constructor(
        private readonly configModel: ConfigModel,
        private readonly connectionManager: ConnectionManager,
        private readonly stateStorage: StateStorage
    ) {
        this.disposables.push(
            this._onDidChangeMismatch,
            this._onDidDetectNewMismatch,
            this._onDidChangeAllowedHosts,
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

    /** Whether the user allowed sending `envHost`'s credentials to `targetHost`. */
    public allowsSessionCredentials(envHost: URL, targetHost: URL): boolean {
        return this.stateStorage
            .get(ALLOWED_KEY)
            .includes(pairKey(envHost.hostname, targetHost.hostname));
    }

    /** Allow or stop sending the session's credentials to this mismatch's host. */
    public async setSessionCredentialsAllowed(
        mismatch: HostMismatch,
        allowed: boolean
    ): Promise<void> {
        const pair = pairKey(mismatch.envHost, mismatch.targetHost);
        const others = this.stateStorage
            .get(ALLOWED_KEY)
            .filter((p) => p !== pair);
        await this.stateStorage.set(
            ALLOWED_KEY,
            allowed ? [...others, pair] : others
        );
        this._onDidChangeAllowedHosts.fire();
        await this.reevaluate();
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
            allowed: this.allowsSessionCredentials(envHost, targetHostUrl),
        };
        this.setMismatch(mismatch);

        const pair = pairKey(mismatch.envHost, mismatch.targetHost);
        if (mismatch.allowed || this.warnedPairs.has(pair)) {
            return;
        }
        this.warnedPairs.add(pair);
        this._onDidDetectNewMismatch.fire(mismatch);
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
}
