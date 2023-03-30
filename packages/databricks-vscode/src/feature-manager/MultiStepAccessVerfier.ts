import {Disposable, EventEmitter} from "vscode";
import {Feature, FeatureEnableAction, FeatureState} from "./FeatureManager";

export type AccessVerifierStep = (...args: any) => Promise<boolean>;

export abstract class MultiStepAccessVerifier implements Disposable, Feature {
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

    async runSteps(steps: Record<string, AccessVerifierStep>) {
        for (const step in steps) {
            this.stepValuesHas(step);
            const stepValue = await steps[step]();
            this.stepValues[step] = stepValue;
            if (!stepValue) {
                break;
            }
        }
        return this.checkAllStepValues();
    }

    rejectStep(id: string, reason?: string, action?: FeatureEnableAction) {
        this.stepValuesHas(id);

        this.stepValues[id] = false;
        this.onDidChangeStateEmitter.fire({
            avaliable: false,
            reason,
            action,
        });
        return false;
    }

    acceptStep(id: string) {
        this.stepValuesHas(id);
        this.stepValues[id] = true;
        this.checkAllStepValues();
        return true;
    }

    private accept() {
        this.onDidChangeStateEmitter.fire({
            avaliable: true,
        });
        return true;
    }

    abstract check(): Promise<void>;

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
