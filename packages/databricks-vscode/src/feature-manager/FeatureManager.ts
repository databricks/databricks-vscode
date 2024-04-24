import {Event, Disposable} from "vscode";
import {Mutex} from "../locking";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {DisabledFeature} from "./DisabledFeature";
import {EnabledFeature} from "./EnabledFeature";
import {logging} from "@databricks/databricks-sdk";
import {Loggers} from "../logger";

export type FeatureEnableAction = (...args: any[]) => Promise<void>;
export type FeatureId = "environment.dependencies";

export interface FeatureState {
    available: boolean;
    message?: string;
    steps: Map<string, FeatureStepState>;
}

export interface FeatureStepState {
    id: string;
    available: boolean;
    title?: string;
    message?: string;
    action?: FeatureEnableAction;
    isDisabledByFf?: boolean;
}

export interface Feature extends Disposable {
    mutex: Mutex;
    state: FeatureState;
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
    private features: Map<T, Feature> = new Map();
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
        this.disposables.push(
            feature.onDidChangeState((state) => {
                this.stateCache.set(id, state);
            })
        );
        this.features.set(id, feature);
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
            throw new Error(`Feature ${id} has not been registered`);
        }
        if (this.disabledFeatures.includes(id)) {
            return {
                available: false,
                steps: new Map(),
                message: "Feature is disabled",
            };
        }
        return await feature.mutex.synchronise(async () => {
            const cachedState = this.stateCache.get(id);
            if (cachedState && !force) {
                return cachedState;
            }
            try {
                await feature.check();
            } catch (e) {
                logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                    `Error checking feature state ${id}`,
                    e
                );
            }
            return feature.state;
        });
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
