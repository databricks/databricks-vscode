import {MultiStepAccessVerifier} from "./MultiStepAccessVerfier";

export class EnabledFeature extends MultiStepAccessVerifier {
    constructor() {
        super(["enabled"]);
    }
    async check() {
        this.acceptStep("enabled");
    }
}
