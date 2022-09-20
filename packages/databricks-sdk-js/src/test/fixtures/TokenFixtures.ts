import {CancellationToken} from "../../types";

export class TokenFixture implements CancellationToken {
    get isCancellationRequested() {
        return false;
    }
}
