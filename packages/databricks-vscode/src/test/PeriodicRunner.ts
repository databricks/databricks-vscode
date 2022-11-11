import Time from "@databricks/databricks-sdk/dist/retries/Time";

export interface RunFunctionDetails {
    fn: () => Promise<void>;
    cleanup?: () => Promise<void>;
    every: Time;
    timer?: NodeJS.Timer;
}

export class PeriodicRunner {
    private runFunctions: RunFunctionDetails[] = [];

    runFunction(runFunctionDetails: RunFunctionDetails) {
        this.runFunctions.push(runFunctionDetails);
        return this;
    }

    start() {
        this.runFunctions.forEach((runFunction, idx) => {
            this.runFunctions[idx].timer = setInterval(
                runFunction.fn,
                runFunction.every.toMillSeconds().value
            );
        });
    }

    async stop() {
        this.runFunctions.forEach((runFunction) => {
            if (runFunction.timer) {
                clearInterval(runFunction.timer);
            }
        });

        this.runFunctions.forEach(async (runFunction) => {
            if (runFunction.cleanup) {
                await runFunction.cleanup();
            }
        });
    }
}
