import {Writable} from "stream";
import {LogEntry, Logger} from "./types";
import {onlyNBytes} from "./utils";

export class DefaultLogger implements Logger {
    private _stream: Writable;
    constructor(outputStream?: Writable) {
        this._stream = outputStream ?? process.stderr;
    }

    log(level: string, message?: string, obj?: any) {
        this._stream.write(
            JSON.stringify({
                level: level,
                message: message,
                ...obj,
            } as LogEntry)
        );
    }
}
