import Time, {TimeUnits} from "./Time";

export class RetriableError extends Error {
    name = "RetriableError";
}

export class TimeoutError extends Error {
    constructor(message?: string) {
        super(`Timeout: ${message}`);
    }
}

export interface RetryPolicy {
    waitTime(attempt: number): Time;
}

export class LinearRetryPolicy {
    constructor(readonly _waitTime: Time) {}

    waitTime(): Time {
        return this._waitTime;
    }
}

export class ExponetionalBackoffWithJitterRetryPolicy implements RetryPolicy {
    maxJitter: Time;
    minJitter: Time;
    maxWaitTime: Time;
    defaultTimeout: Time;

    constructor(
        options: {
            maxJitter?: Time;
            minJitter?: Time;
            maxWaitTime?: Time;
            defaultTimeout?: Time;
        } = {}
    ) {
        this.maxJitter =
            options.maxJitter || new Time(750, TimeUnits.milliseconds);
        this.minJitter =
            options.minJitter || new Time(50, TimeUnits.milliseconds);
        this.maxWaitTime =
            options.maxWaitTime || new Time(10, TimeUnits.seconds);
        this.defaultTimeout =
            options.defaultTimeout || new Time(10, TimeUnits.minutes);
    }

    waitTime(attempt: number): Time {
        const jitter = this.maxJitter
            .sub(this.minJitter)
            .multiply(Math.random())
            .add(this.minJitter);
        const timeout = new Time(attempt, TimeUnits.seconds).add(jitter);

        return timeout.gt(this.maxWaitTime) ? this.maxWaitTime : timeout;
    }
}

export const DEFAULT_RETRY_CONFIG =
    new ExponetionalBackoffWithJitterRetryPolicy();

interface RetryArgs<T> {
    timeout?: Time;
    retryPolicy?: RetryPolicy;
    fn: () => Promise<T>;
}

export default async function retry<T>({
    timeout = DEFAULT_RETRY_CONFIG.defaultTimeout,
    retryPolicy: retryConfig = DEFAULT_RETRY_CONFIG,
    fn,
}: RetryArgs<T>): Promise<T> {
    let attempt = 1;
    let retriableErr: RetriableError = new RetriableError("timeout");
    let nonRetriableErr: Error | undefined = undefined;
    let result: T | undefined = undefined;

    let timedOut = false;
    const timer: NodeJS.Timeout = setTimeout(() => {
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
                retryConfig.waitTime(attempt).toMillSeconds().value
            )
        );

        attempt += 1;
    }

    clearTimeout(timer);

    if (nonRetriableErr) {
        throw nonRetriableErr;
    }
    if (!success) {
        throw new TimeoutError(retriableErr.message);
    }
    return result!;
}
