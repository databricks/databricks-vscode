import {Event, EventEmitter, Disposable} from "vscode";
import {DisabledFeature} from "./DisabledFeature";

export type FeatureEnableAction = () => Promise<void>;
export interface FeatureState {
    avaliable: boolean;
    reason?: string;
    action?: FeatureEnableAction;
}

export type FeatureId = "debugging.dbconnect";
export const disabledFeatures: FeatureId[] = ["debugging.dbconnect"];
export interface Feature {
    check: () => Promise<void>;
    onDidChangeState: Event<FeatureState>;
}

export class FeatureManager implements Disposable {
    private disposables: Disposable[] = [];

    private features: Map<
        FeatureId,
        {
            feature: Feature;
            onDidChangeStateEmitter: EventEmitter<FeatureState>;
            onDidChangeState: Event<FeatureState>;
        }
    > = new Map();

    private stateCache: Map<FeatureId, FeatureState> = new Map();

    constructor() {}

    registerFeature(id: FeatureId, feature: Feature) {
        if (this.features.has(id)) {
            return;
        }
        if (disabledFeatures.includes(id)) {
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

    onDidChangeState(
        id: FeatureId,
        f: (state: FeatureState) => any,
        thisArgs?: any
    ) {
        const feature = this.features.get(id);
        if (feature) {
            return feature.onDidChangeState(f, thisArgs);
        }
        return new Disposable(() => {});
    }

    async isEnabled(id: FeatureId, force = false): Promise<FeatureState> {
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
