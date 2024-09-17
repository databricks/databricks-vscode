import {Run} from "@databricks/databricks-sdk/dist/apis/jobs";
import {SimplifiedRunState} from "./RunStateUtils";

export function getSimplifiedRunState(run?: Run): SimplifiedRunState {
    if (run?.state?.life_cycle_state === undefined) {
        return "Unknown";
    }

    switch (run.state.life_cycle_state) {
        case "INTERNAL_ERROR":
            return "Failed";
        case "SKIPPED":
            return "Skipped";
        case "WAITING_FOR_RETRY":
        case "BLOCKED":
        case "PENDING":
            return "Pending";
        case "RUNNING":
            if (run.state.user_cancelled_or_timedout) {
                return "Terminating";
            }
            return "Running";
        case "TERMINATING":
            return "Terminating";
        case "TERMINATED":
            if (run.state.user_cancelled_or_timedout) {
                return "Cancelled";
            }
            switch (run.state.result_state) {
                case "SUCCESS":
                case "SUCCESS_WITH_FAILURES":
                    return "Success";
                case "MAXIMUM_CONCURRENT_RUNS_REACHED":
                case "FAILED":
                case "TIMEDOUT":
                    return "Failed";
                case "UPSTREAM_CANCELED":
                case "UPSTREAM_FAILED":
                case "EXCLUDED":
                    return "Skipped";
                case "CANCELED":
                    return "Cancelled";
            }
            return "Terminated";
    }

    return "Unknown";
}
