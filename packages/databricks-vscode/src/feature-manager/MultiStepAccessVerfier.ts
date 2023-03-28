import {Disposable, EventEmitter} from "vscode";
import {Feature, FeatureEnableAction, FeatureState} from "./FeatureManager";

export type AccessVerifierStep = (...args: any) => Promise<boolean>;

export abstract class MultiStepAccessVerifier implements Disposable, Feature {
    protected disposables: Disposable[] = [];
    protected onDidChangeStateEmitter = new EventEmitter<FeatureState>();
    public onDidChangeState = this.onDidChangeStateEmitter.event;
    protected readonly stepValues: Record<string, boolean> = {};
    constructor(steps: string[]) {
        steps.forEach((step) => (this.stepValues[step] = false));
    }

    async runSteps(steps: Record<string, AccessVerifierStep>) {
        for (const step in steps) {
            if (!Object.keys(this.stepValues).includes(step)) {
                throw Error(`Verification step ${step} is not registered.`);
            }
            const stepValue = await steps[step]();
            this.stepValues[step] = stepValue;
            if (!stepValue) {
                return;
            }
        }
        const combinedValue = Object.values(this.stepValues).reduce(
            (prev, current) => prev && current,
            true
        );
        if (combinedValue) {
            this.accept();
        }
        return combinedValue;
    }

    reject(reason?: string, action?: FeatureEnableAction) {
        this.onDidChangeStateEmitter.fire({
            avaliable: false,
            reason,
            action,
        });
        return false;
    }

    rejectFf() {
        this.onDidChangeStateEmitter.fire({
            avaliable: false,
            featureFlag: false,
        });
    }

    accept() {
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
