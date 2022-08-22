import Time, {TimeUnits} from "@databricks/databricks-sdk/dist/retries/Time";

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
            const jitter = new Time(Math.random(), TimeUnits.seconds);

            setTimeout(() => {
                console.log("here", jitter.toMillSeconds().value);
                this.runFunctions[idx].timer = setInterval(
                    runFunction.fn,
                    runFunction.every.toMillSeconds().value
                );
            }, jitter.toMillSeconds().value);
        });
    }

    async stop() {
        this.runFunctions.forEach(async (runFunction) => {
            console.log(runFunction.timer);
            if (runFunction.timer) {
                clearInterval(runFunction.timer);
            }
            if (runFunction.cleanup) {
                await runFunction.cleanup();
            }
        });
    }
}
