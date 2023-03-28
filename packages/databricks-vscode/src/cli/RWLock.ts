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

export class RWLock {
    private readerMutex = new Mutex();
    private writerMutex = new Mutex();
    private readerCount = 0;

    async readerEntry() {
        await this.readerMutex.wait();
        this.readerCount++;
        if (this.readerCount === 1) {
            await this.writerMutex.wait();
        }
        this.readerMutex.signal();
    }

    async readerExit() {
        await this.readerMutex.wait();
        this.readerCount--;
        if (this.readerCount === 0) {
            this.writerMutex.signal();
        }
        this.readerMutex.signal();
    }

    async writerEntry() {
        await this.readerMutex.wait();
        this.readerMutex.signal();
        await this.writerMutex.wait();
    }

    async writerExit() {
        this.writerMutex.signal();
    }
}
