import {Event, Disposable} from "vscode";
import {Mutex} from "../locking";
import {workspaceConfigs} from "../vscode-objs/WorkspaceConfigs";
import {DisabledFeature} from "./DisabledFeature";
import {EnabledFeature} from "./EnabledFeature";
import {logging} from "@databricks/sdk-experimental";
import {Loggers} from "../logger";

export type FeatureEnableAction = (...args: any[]) => Promise<void>;

/**
 * Feature id for the uv-native Python environment setup (python-setup).
 *
 * This exact string is the single source of truth used in two coupled places,
 * and they must stay identical or the feature can never unlock:
 *  - the {@link FeatureManager} `disabledFeatures` entry that hides it by
 *    default (see extension.ts), and
 *  - the value a user adds to `databricks.experiments.optInto` to opt in
 *    (see the enum in package.json), which {@link FeatureManager} matches
 *    verbatim against the disabled id to decide whether to unlock.
 * Exporting it as a constant keeps those two from drifting apart.
 */
export const PYTHON_SETUP_FEATURE_ID = "environment.pythonSetup";

export type FeatureId =
    | "environment.dependencies"
    | typeof PYTHON_SETUP_FEATURE_ID;

export interface FeatureState {
    available: boolean;
    message?: string;
    steps: Map<string, FeatureStepState>;
}

export interface FeatureStepState {
    id: string;
    available: boolean;
    optional?: boolean;
    title?: string;
    message?: string;
    warning?: string;
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

    /**
     * A feature is disabled when it is in the {@link disabledFeatures} list and
     * the user has not opted into it via `databricks.experiments.optInto`.
     * Both {@link registerFeature} (which picks the factory) and
     * {@link isEnabled} (which reports availability) must agree on this, or an
     * opted-in feature would be registered as enabled yet still report
     * unavailable.
     */
    private isDisabled(id: T): boolean {
        return (
            this.disabledFeatures.includes(id) &&
            !workspaceConfigs.experimetalFeatureOverides.includes(id as string)
        );
    }

    registerFeature(
        id: T,
        featureFactory: () => Feature = () => new EnabledFeature()
    ) {
        if (this.features.has(id)) {
            return;
        }
        const feature = this.isDisabled(id)
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
        if (this.isDisabled(id)) {
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
