import {logging} from "@databricks/databricks-sdk";

export type Step<S, N> = () => Promise<
    SuccessResult<S> | NextResult<N> | ErrorResult
>;

type StepResult<S, N> = SuccessResult<S> | NextResult<N> | ErrorResult;

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
    logger?: logging.NamedLogger
): Promise<S> {
    let counter = 0;

    let step: KEYS | undefined = start;
    while (step && steps[step]) {
        counter += 1;
        if (counter > maxSteps) {
            throw new OrchestrationLoopError();
        }
        const result: StepResult<S, KEYS> = await steps[step]();
        logger?.info(`Azire CLI check: ${step}`, result);

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
    throw new Error("Missing return step");
}
