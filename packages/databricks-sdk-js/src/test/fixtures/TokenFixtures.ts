import {CancellationToken} from "../../types";

export class TokenFixture implements CancellationToken {
    private listeners: Array<(e?: any) => any> = [];

    get isCancellationRequested() {
        return false;
    }

    onCancellationRequested(f: (e?: any) => any) {
        this.listeners.push(f);
    }
}
