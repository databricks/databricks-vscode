import Time, {TimeUnits} from "./Time";

export class RetriableError extends Error {
    name: string = "RetriableError";
}

export interface RetriableResult<T> {
    result?: T;
    error?: unknown;
}

const maxJitter = new Time(750, TimeUnits.milliseconds);
const minJitter = new Time(50, TimeUnits.milliseconds);
const maxWaitTime = new Time(10, TimeUnits.seconds);
const defaultTimeout = new Time(10, TimeUnits.minutes);

function waitTime(attempt: number) {
    const jitter = maxJitter
        .sub(minJitter)
        .multiply(Math.random())
        .add(minJitter);
    const timeout = new Time(attempt, TimeUnits.seconds).add(jitter);

    return timeout.gt(maxWaitTime) ? maxWaitTime : timeout;
}

interface RetryArgs<T> {
    timeout?: Time;
    fn: () => Promise<T>;
}

export default async function retry<T>({
    timeout = defaultTimeout,
    fn,
}: RetryArgs<T>): Promise<T> {
    let attempt = 1;
    let retriableErr: RetriableError = new RetriableError("timeout");
    let nonRetriableErr: Error | undefined = undefined;
    let result: T | undefined = undefined;

    let timedOut = false;
    let timer: NodeJS.Timeout = setTimeout(() => {
        timedOut = true;
    }, timeout.toMillSeconds().value);

    let success = false;

    while (!timedOut) {
        try {
            result = await fn();
            success = true;
            break;
        } catch (err: unknown) {
            if (err instanceof RetriableError) {
                retriableErr = err;
            } else {
                nonRetriableErr = err as Error;
                break;
            }
        }

        await new Promise((resolve) =>
            setTimeout(resolve, waitTime(attempt).toMillSeconds().value)
        );

        attempt += 1;
    }

    clearTimeout(timer);

    if (nonRetriableErr) {
        throw nonRetriableErr;
    }
    if (!success) {
        throw retriableErr;
    }
    return result!;
}
