import {EventEmitter, Disposable} from "vscode";
import {OnErrorProps, withOnErrorHandler} from "./onErrorDecorator";
import lodash from "lodash";

export class EventEmitterWithErrorHandler<T> {
    private _eventEmitter = new EventEmitter<T>();
    private _event = this._eventEmitter.event;

    constructor(private readonly onErrorDefaults: OnErrorProps = {}) {}

    get event() {
        const fn = (
            listener: (e: T) => Promise<unknown>,
            opts: {
                thisArgs?: any;
                disposables?: Disposable[];
                onError?: OnErrorProps;
            } = {}
        ) => {
            opts = lodash.merge({}, this.onErrorDefaults, opts);

            return this._event(
                withOnErrorHandler(listener, opts.onError),
                opts.thisArgs,
                opts.disposables
            );
        };

        return fn.bind(this);
    }

    fire(event: T) {
        this._eventEmitter.fire(event);
    }

    dispose() {
        this._eventEmitter.dispose();
    }
}
