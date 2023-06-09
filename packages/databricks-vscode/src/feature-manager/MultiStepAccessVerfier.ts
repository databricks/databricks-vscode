import {Disposable, EventEmitter} from "vscode";
import {Feature, FeatureEnableAction, FeatureState} from "./FeatureManager";

export type AccessVerifierStep = (...args: any) => Promise<boolean>;
export abstract class MultiStepAccessVerifier implements Feature {
    protected disposables: Disposable[] = [];
    protected onDidChangeStateEmitter = new EventEmitter<FeatureState>();
    public onDidChangeState = this.onDidChangeStateEmitter.event;
    public readonly stepValues: Record<string, boolean> = {};

    constructor(steps: string[]) {
        steps.forEach((step) => (this.stepValues[step] = false));
    }

    private stepValuesHas(key: string) {
        if (!Object.keys(this.stepValues).includes(key)) {
            throw Error(`Verification step ${key} is not registered.`);
        }
    }

    private checkAllStepValues() {
        const combinedValue = Object.values(this.stepValues).reduce(
            (prev, current) => prev && current,
            true
        );
        if (combinedValue) {
            this.accept();
        }
        return combinedValue;
    }

    rejectStep(
        id: string,
        reason?: string,
        action?: FeatureEnableAction,
        featureFlag?: boolean
    ) {
        this.stepValuesHas(id);

        this.stepValues[id] = false;
        const state = {
            avaliable: false,
            reason,
            action,
            isDisabledByFf: featureFlag === false,
        };
        this.onDidChangeStateEmitter.fire(state);
        return state;
    }

    acceptStep(id: string) {
        this.stepValuesHas(id);
        this.stepValues[id] = true;
        this.checkAllStepValues();
        return true;
    }

    private accept() {
        const state = {
            avaliable: true,
        };
        this.onDidChangeStateEmitter.fire(state);
        return state;
    }

    abstract check(): Promise<void>;

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
