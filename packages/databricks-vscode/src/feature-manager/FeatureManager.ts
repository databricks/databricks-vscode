import {Event, EventEmitter, Disposable} from "vscode";
import {Mutex} from "../locking";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {DisabledFeature} from "./DisabledFeature";
import {EnabledFeature} from "./EnabledFeature";

export type FeatureEnableAction = () => Promise<void>;
export type FeatureId = "debugging.dbconnect";
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
    dirty?: boolean;
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
 */
export class FeatureManager<T = FeatureId> implements Disposable {
    private disposables: Disposable[] = [];
    private readonly mutex: Mutex = new Mutex();

    private features: Map<
        T,
        {
            feature: Feature;
            onDidChangeStateEmitter: EventEmitter<FeatureState>;
            onDidChangeState: Event<FeatureState>;
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
        await this.mutex.wait();
        try {
            const feature = this.features.get(id);
            if (!feature) {
                return {
                    avaliable: false,
                    reason: `Feature ${id} has not been registered`,
                };
            }

            const cachedState = this.stateCache.get(id);
            if (cachedState) {
                if (!force) {
                    return cachedState;
                }
                cachedState.dirty = true;
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
            this.mutex.signal();
        }
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
