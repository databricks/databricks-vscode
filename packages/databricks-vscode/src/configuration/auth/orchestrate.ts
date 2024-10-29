import {logging} from "@databricks/databricks-sdk";
import {CancellationToken} from "vscode";

type StepResult<S, N> = SuccessResult<S> | NextResult<N> | ErrorResult;
export type Step<S, N> = () => Promise<StepResult<S, N>>;

export interface SuccessResult<T> {
    type: "success";
    result: T;
}

export interface NextResult<T> {
    type: "next";
    next: T;
}

export interface ErrorResult {
    type: "error";
    error: Error;
}

export class OrchestrationLoopError extends Error {
    constructor() {
        super("OrchestrationLoopError");
    }
}

export async function orchestrate<S, KEYS extends string>(
    steps: Record<KEYS, Step<S, KEYS>>,
    start: KEYS,
    maxSteps = 20,
    logger?: logging.NamedLogger,
    cancellationToken?: CancellationToken
): Promise<S> {
    let counter = 0;

    let step: KEYS | undefined = start;
    function isCancelled() {
        return cancellationToken?.isCancellationRequested === true;
    }
    while (step && steps[step] && !isCancelled()) {
        counter += 1;
        if (counter > maxSteps) {
            throw new OrchestrationLoopError();
        }

        let result: StepResult<S, KEYS> | undefined = undefined;
        const task: Promise<StepResult<S, KEYS> | undefined> = (async () => {
            return await steps[step!]();
        })().catch((e) => {
            if (!isCancelled()) {
                throw e;
            }
            return undefined;
        });

        result = await Promise.race([
            task,
            new Promise<undefined>((resolve) => {
                cancellationToken?.onCancellationRequested(() =>
                    resolve(undefined)
                );
            }),
        ]);
        if (result === undefined || isCancelled()) {
            throw new OrchestrationLoopError();
        }

        logger?.info(`Auth check: ${step}`, result);

        if (result.type === "error") {
            throw result.error;
        }

        if (result.type === "success") {
            return result.result;
        }

        if (result.next) {
            step = result.next;
        }
    }
    throw new OrchestrationLoopError();
}
