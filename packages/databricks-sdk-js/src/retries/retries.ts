import Time, {TimeUnits} from "./Time";

export class RetriableError extends Error {
    name: string = "RetriableError";
}

export interface RetriableResult<T> {
    result?: T;
    error?: unknown;
}

export class RetryConfigs {
    static maxJitter = new Time(750, TimeUnits.milliseconds);
    static minJitter = new Time(50, TimeUnits.milliseconds);
    static maxWaitTime = new Time(10, TimeUnits.seconds);
    static defaultTimeout = new Time(10, TimeUnits.minutes);

    static waitTime(attempt: number) {
        const jitter = RetryConfigs.maxJitter
            .sub(RetryConfigs.minJitter)
            .multiply(Math.random())
            .add(RetryConfigs.minJitter);
        const timeout = new Time(attempt, TimeUnits.seconds).add(jitter);

        return timeout.gt(RetryConfigs.maxWaitTime)
            ? RetryConfigs.maxWaitTime
            : timeout;
    }
}

interface RetryArgs<T> {
    timeout?: Time;
    fn: () => Promise<T>;
}

export default async function retry<T>({
    timeout = RetryConfigs.defaultTimeout,
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
            setTimeout(
                resolve,
                RetryConfigs.waitTime(attempt).toMillSeconds().value
            )
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
