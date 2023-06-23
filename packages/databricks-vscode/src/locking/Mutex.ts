export class Mutex {
    private waitQueue: ((value?: any) => void)[] = [];
    private _locked = false;

    async wait() {
        if (this._locked) {
            await new Promise((resolve) => {
                this.waitQueue.push(resolve);
            });
        } else {
            this._locked = true;
        }
    }

    signal() {
        const resolveF = this.waitQueue.shift();
        if (resolveF) {
            resolveF();
        } else {
            this._locked = false;
        }
    }
}
