import {randomUUID} from "crypto";
import {NamedLogger} from "../logging";
import {CancellationToken} from "../types";

export interface ContextItems {
    logger?: NamedLogger;
    opId?: string;
    opName?: string;
    rootClassName?: string;
    rootFnName?: string;
    cancellationToken?: CancellationToken;
}

export class Context {
    private _items: ContextItems = {};

    get logger() {
        return this._items.logger;
    }

    get opId() {
        return this._items.opId;
    }

    get opName() {
        return this._items.opName;
    }

    get rootClassName() {
        return this._items.rootClassName;
    }

    get rootFnName() {
        return this._items.rootFnName;
    }

    get cancellationToken() {
        return this._items?.cancellationToken;
    }

    constructor(items: ContextItems = {}) {
        this.setItems(items);
        this._items.opId = this._items.opId ?? randomUUID();
    }

    setItems(items: ContextItems = {}) {
        this._items = {
            ...this._items,
            ...items,
        };
    }

    copy() {
        return new Context(this._items);
    }
}
