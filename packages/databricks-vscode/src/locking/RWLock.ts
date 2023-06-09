import {Mutex} from "./Mutex";

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
