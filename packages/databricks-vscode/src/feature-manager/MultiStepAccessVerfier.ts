import {Disposable, EventEmitter} from "vscode";
import {
    Feature,
    FeatureEnableAction,
    FeatureState,
    FeatureStepState,
} from "./FeatureManager";
import lodash from "lodash";
import {Mutex} from "../locking";

export type AccessVerifierStep = (...args: any) => Promise<boolean>;
export abstract class MultiStepAccessVerifier implements Feature {
    public mutex = new Mutex();
    protected disposables: Disposable[] = [];
    protected onDidChangeStateEmitter = new EventEmitter<FeatureState>();
    public onDidChangeState = this.onDidChangeStateEmitter.event;

    public readonly state: FeatureState = {available: false, steps: new Map()};

    constructor(steps: string[]) {
        steps.forEach((step) =>
            this.state.steps.set(step, {id: step, available: false})
        );
    }

    private assertStep(key: string) {
        if (!this.state.steps.has(key)) {
            throw Error(`Verification step ${key} is not registered.`);
        }
    }

    private updateStep(stepState: FeatureStepState) {
        this.assertStep(stepState.id);
        const oldStepState = this.state.steps.get(stepState.id);
        this.state.steps.set(stepState.id, stepState);
        const oldAvailability = this.state.available;
        this.state.available = Array.from(this.state.steps).reduce(
            (result, current) => result && current[1].available,
            true
        );
        const nonComparableFields: Array<keyof FeatureStepState> = ["action"];
        if (
            oldAvailability !== this.state.available ||
            !lodash.isEqual(
                lodash.omit(oldStepState, nonComparableFields),
                lodash.omit(stepState, nonComparableFields)
            )
        ) {
            this.onDidChangeStateEmitter.fire(this.state);
        }
        return stepState;
    }

    /**
     * Reject the current step in the verification process.
     * @param id of the step
     * @param title reason for rejection
     * @param action action to take that can resolve the rejection
     * @param isDisabledByFf if the rejection is caused by a feature flag then set this to true.
     * @returns
     */
    rejectStep(
        id: string,
        title: string,
        message?: string,
        action?: FeatureEnableAction,
        isDisabledByFf?: boolean
    ) {
        return this.updateStep({
            id: id,
            available: false,
            title,
            message,
            action,
            isDisabledByFf: isDisabledByFf === true,
        });
    }

    acceptStep(id: string) {
        return this.updateStep({id: id, available: true});
    }

    abstract check(): Promise<void>;

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
