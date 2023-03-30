import {Event, EventEmitter, Disposable} from "vscode";
import {DisabledFeature} from "./DisabledFeature";

export type FeatureEnableAction = () => Promise<void>;

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
}

export interface Feature {
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
export class FeatureManager<T extends string> implements Disposable {
    private disposables: Disposable[] = [];

    private features: Map<
        T,
        {
            feature: Feature;
            onDidChangeStateEmitter: EventEmitter<FeatureState>;
            onDidChangeState: Event<FeatureState>;
        }
    > = new Map();

    private stateCache: Map<T, FeatureState> = new Map();
    constructor(private readonly disabledFeatures: T[]) {}

    registerFeature(id: T, feature: Feature) {
        if (this.features.has(id)) {
            return;
        }
        if (this.disabledFeatures.includes(id)) {
            feature = new DisabledFeature();
        }
        const eventEmitter = new EventEmitter<FeatureState>();
        this.disposables.push(
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
            })
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
        const feature = this.features.get(id);
        if (!feature) {
            return {
                avaliable: false,
                reason: `Feature ${id} has not been registered`,
            };
        }

        const cachedState = this.stateCache.get(id);
        if (cachedState && !force) {
            return cachedState;
        }

        const state = await new Promise<FeatureState>((resolve, reject) => {
            const changeListener = this.onDidChangeState(id, (state) => {
                changeListener.dispose();
                resolve(state);
            });
            feature.feature.check().catch((e) => {
                changeListener.dispose();
                reject(e);
            });
        });

        return state;
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
