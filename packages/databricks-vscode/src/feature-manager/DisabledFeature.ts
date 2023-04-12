import {MultiStepAccessVerifier} from "./MultiStepAccessVerfier";

export class DisabledFeature extends MultiStepAccessVerifier {
    constructor() {
        super(["disabled"]);
    }

    async check() {
        await this.runSteps({
            disabled: async () =>
                this.rejectStep(
                    "disabled",
                    "feature is disabled",
                    undefined,
                    false
                ),
        });
    }
}
