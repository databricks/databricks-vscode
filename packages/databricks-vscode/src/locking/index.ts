import {Mutex} from "./Mutex";

export * from "./Mutex";
export * from "./RWLock";

export class WithMutex<T> {
    mutex = new Mutex();
    constructor(public value: T) {}
}
