import {MultiStepAccessVerifier} from "./MultiStepAccessVerfier";

export class DisabledFeature extends MultiStepAccessVerifier {
    constructor() {
        super(["disabled"]);
    }

    async check() {
        this.rejectFf();
    }
}
