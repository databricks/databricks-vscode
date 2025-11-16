import {EventEmitter} from "vscode";
import {RunState} from "./types";
import {ResourceKey} from "../types";
import {BundleRemoteState} from "../models/BundleRemoteStateModel";
import {Time, TimeUnits} from "@databricks/sdk-experimental";
export abstract class BundleRunStatus {
    abstract readonly type: ResourceKey<BundleRemoteState>;
    protected readonly onDidChangeEmitter = new EventEmitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;
    runId: string | undefined;
    data: any;

    constructor() {
        //  Timeout in 60 seconds if we don't have a runId till then.
        setTimeout(() => {
            if (this.runState === "unknown") {
                this.runState = "timeout";
            }
        }, new Time(60, TimeUnits.seconds).toMillSeconds().value);
    }
    protected _runState: RunState = "unknown";
    public get runState(): RunState {
        return this._runState;
    }
    public set runState(value: RunState) {
        this._runState = value;
        this.onDidChangeEmitter.fire();
    }

    abstract parseId(output: string): void;
    abstract cancel(): Promise<void>;
}
