import {Writable} from "stream";
import {LogEntry, Logger} from "./types";

export class DefaultLogger implements Logger {
    private _stream: Writable;
    constructor(outputStream?: Writable) {
        //set to noop if no stream specified
        this._stream =
            outputStream ??
            new (class extends Writable {
                _write(
                    chunk: any,
                    encoding: BufferEncoding,
                    callback: (error?: Error | null | undefined) => void
                ): void {
                    callback();
                }
            })();
    }

    log(level: string, message?: string, obj?: any) {
        this._stream.write(
            JSON.stringify({
                level: level,
                message: message,
                ...obj,
            } as LogEntry) + "\n"
        );
    }
}
