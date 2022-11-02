import {randomUUID} from "crypto";
import {NamedLogger} from "../logging";
import {CancellationToken} from "../types";

export interface ContextItems {
    logger?: NamedLogger;
    opId?: string;
    opName?: string;
    cancellationToken?: CancellationToken;
}

export class Context {
    private _logger?: NamedLogger;
    get logger() {
        return this._logger;
    }

    private _opId: string;
    get opId() {
        return this._opId;
    }

    private _opName?: string;
    get opName() {
        return this._opName;
    }

    private _cancelationToken?: CancellationToken;
    get cancellationToken() {
        return this._cancelationToken;
    }

    constructor(items: ContextItems = {}) {
        this._opId = randomUUID();
        this.setItems(items);
    }

    setItems(items: ContextItems = {}) {
        this._cancelationToken =
            items.cancellationToken ?? this._cancelationToken;
        this._opId = items.opId ?? this._opId;
        this._opName = items.opName ?? this._opName;
        this._logger = items.logger ?? this._logger;
    }
}
