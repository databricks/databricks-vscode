import {Disposable, EventEmitter} from "vscode";
import {Feature, FeatureEnableAction, FeatureState} from "./FeatureManager";

export type AccessVerifierStep = (...args: any) => Promise<boolean>;
export abstract class MultiStepAccessVerifier implements Feature {
    protected disposables: Disposable[] = [];
    // Fired when the state of the entire feature changes (all steps are accepted, or >=1 steps are rejected)
    protected onDidChangeStateEmitter = new EventEmitter<FeatureState>();
    public onDidChangeState = this.onDidChangeStateEmitter.event;

    // Fired when the state of a single step changes (accepted or rejected)
    protected onDidChangeStepStateEmitter = new EventEmitter<{
        id: string;
        value: boolean;
    }>();
    public onDidChangeStepState = this.onDidChangeStepStateEmitter.event;

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
    /**
     * Reject the current step in the verification process.
     * @param id of the step
     * @param reason reason for rejection
     * @param action action to take that can resolve the rejection
     * @param isDisabledByFf if the rejection is caused by a feature flag then set this to true.
     * @returns
     */
    rejectStep(
        id: string,
        reason?: string,
        action?: FeatureEnableAction,
        isDisabledByFf?: boolean
    ) {
        this.stepValuesHas(id);
        if (this.stepValues[id]) {
            this.onDidChangeStepStateEmitter.fire({
                id,
                value: false,
            });
        }
        this.stepValues[id] = false;
        const state: FeatureState = {
            avaliable: false,
            reason,
            action,
            isDisabledByFf: isDisabledByFf === true,
        };

        this.onDidChangeStateEmitter.fire(state);
        return state;
    }

    acceptStep(id: string) {
        this.stepValuesHas(id);
        if (!this.stepValues[id]) {
            this.onDidChangeStepStateEmitter.fire({
                id,
                value: true,
            });
        }
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

    protected async waitForStep(id: string) {
        this.stepValuesHas(id);
        if (this.stepValues[id]) {
            return true;
        }
        await new Promise<void>((resolve) => {
            const changeListener = this.onDidChangeStepState((e) => {
                if (e.id === id && e.value === true) {
                    resolve();
                    changeListener.dispose();
                }
            });
        });
    }

    abstract check(): Promise<void>;

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
