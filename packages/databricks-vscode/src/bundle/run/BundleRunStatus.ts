import {EventEmitter} from "vscode";
import {RunState} from "./types";
import {ResourceKey} from "../types";
import {BundleRemoteState} from "../models/BundleRemoteStateModel";

export abstract class BundleRunStatus {
    abstract readonly type: ResourceKey<BundleRemoteState>;
    protected readonly onDidChangeEmitter = new EventEmitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;
    runId: string | undefined;
    data: any;

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
