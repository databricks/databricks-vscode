import {EventEmitter} from "vscode";
import {ResourceType} from "../models/BundleRemoteStateModel";
import {RunState} from "./types";

export abstract class BundleRunStatus {
    abstract readonly type: ResourceType;
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
