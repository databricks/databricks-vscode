import {Event, EventEmitter, Disposable} from "vscode";
import {Mutex} from "../locking";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {DisabledFeature} from "./DisabledFeature";
import {EnabledFeature} from "./EnabledFeature";

export type FeatureEnableAction = (...args: any[]) => Promise<void>;
export type FeatureId = "debugging.dbconnect" | "notebooks.dbconnect";
/**
 * The state of a feature.
 * *available*: If feature is enabled.
 * *reason*: If feature is disabled, this is the human readable reason for feature being disabled.
 * *action*: If feature is disabled, this optionally contains the function which tries to solve the issue
 * and enable the feature.
 */
export interface FeatureState {
    avaliable: boolean;
    reason?: string;
    action?: FeatureEnableAction;
    isDisabledByFf?: boolean;
    // Dirty is expected to only ever be et by featureManager.
    // This forces a refresh of the cache because any incoming feature state will
    // be different from the cached value, by not having this flag set.
    _dirty?: boolean;
}

export interface Feature extends Disposable {
    check: () => Promise<void>;
    onDidChangeState: Event<FeatureState>;
}

/**
 * This class acts as the single source of truth for detecting if features are available
 * and if features are enabled. The values are cached where possible.
 * *Available feature*: Features for which all conditions (python package, workspace config, cluster dbr etc)
 * are satified.
 * *Disabled features*: Features which are disabled by feature flags. Their availability checks are not performed.
 *                      until the experimental override is set to true.
 */
export class FeatureManager<T = FeatureId> implements Disposable {
    private disposables: Disposable[] = [];

    private features: Map<
        T,
        {
            feature: Feature;
            onDidChangeStateEmitter: EventEmitter<FeatureState>;
            onDidChangeState: Event<FeatureState>;
            mutex: Mutex;
        }
    > = new Map();

    private stateCache: Map<T, FeatureState> = new Map();
    constructor(private readonly disabledFeatures: (T | FeatureId)[]) {}

    registerFeature(
        id: T,
        featureFactory: () => Feature = () => new EnabledFeature()
    ) {
        if (this.features.has(id)) {
            return;
        }
        const feature =
            this.disabledFeatures.includes(id) &&
            !workspaceConfigs.experimetalFeatureOverides.includes(id as string)
                ? new DisabledFeature()
                : featureFactory();

        const eventEmitter = new EventEmitter<FeatureState>();
        this.disposables.push(
            feature,
            feature.onDidChangeState((e) => {
                if (
                    !this.stateCache.has(id) ||
                    (this.stateCache.has(id) &&
                        JSON.stringify(this.stateCache.get(id)) !==
                            JSON.stringify(e))
                ) {
                    eventEmitter.fire(e);
                    this.stateCache.set(id, e);
                }
            }, this)
        );
        this.features.set(id, {
            feature,
            onDidChangeStateEmitter: eventEmitter,
            onDidChangeState: eventEmitter.event,
            mutex: new Mutex(),
        });
    }

    onDidChangeState(id: T, f: (state: FeatureState) => any, thisArgs?: any) {
        const feature = this.features.get(id);
        if (feature) {
            return feature.onDidChangeState(f, thisArgs);
        }
        return new Disposable(() => {});
    }

    /**
     * @param id feature id
     * @param force force refresh cached value
     * @returns Promise<{@link FeatureState}>
     */
    async isEnabled(id: T, force = false): Promise<FeatureState> {
        const feature = this.features.get(id);
        if (!feature) {
            return {
                avaliable: false,
                reason: `Feature ${id} has not been registered`,
            };
        }
        await feature.mutex.wait();
        try {
            const cachedState = this.stateCache.get(id);
            if (cachedState) {
                if (!force) {
                    return cachedState;
                }
                cachedState._dirty = true;
            }

            const state = await new Promise<FeatureState>((resolve, reject) => {
                const changeListener = this.onDidChangeState(
                    id,
                    (state) => {
                        changeListener.dispose();
                        resolve(state);
                    },
                    this
                );
                feature.feature.check().catch((e) => {
                    changeListener.dispose();
                    reject(e);
                });
            });
            return state;
        } finally {
            feature.mutex.signal();
        }
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
