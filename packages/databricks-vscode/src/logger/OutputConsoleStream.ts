import internal, {Writable} from "stream";
import {StringDecoder} from "string_decoder";
import {LogOutputChannel} from "vscode";

export const LOG_OUTPUT_CHANNEL_LEVELS = [
    "info",
    "error",
    "warn",
    "debug",
    "trace",
] as const;

export class LogOutputChannelStream extends Writable {
    private readonly _decoder = new StringDecoder();
    constructor(
        private readonly _outputChannel: LogOutputChannel,
        private readonly level: (typeof LOG_OUTPUT_CHANNEL_LEVELS)[number],
        opts?: internal.WritableOptions
    ) {
        super(opts);
    }

    _write(
        chunk: any,
        encoding: BufferEncoding,
        callback: (error?: Error | null | undefined) => void
    ): void {
        let decoded = Buffer.isBuffer(chunk)
            ? this._decoder.write(chunk)
            : chunk;

        if (typeof decoded === "string") {
            decoded = decoded.trimEnd();
        }
        this._outputChannel[this.level](decoded);
        callback();
    }

    _final(callback: (error?: Error | null | undefined) => void): void {
        this._outputChannel.append(this._decoder.end());
        callback();
    }
}
