import {CancellationToken} from "../../types";

export default class TokenFixture implements CancellationToken {
    get isCancellationRequested() {
        return false;
    }
}
