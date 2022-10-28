import internal, {Writable} from "stream";
import {StringDecoder} from "string_decoder";
import {OutputChannel} from "vscode";

export class OutputConsoleStream extends Writable {
    private readonly _decoder = new StringDecoder();
    constructor(
        private readonly _outputChannel: OutputChannel,
        opts?: internal.WritableOptions
    ) {
        super(opts);
    }

    _write(
        chunk: any,
        encoding: BufferEncoding,
        callback: (error?: Error | null | undefined) => void
    ): void {
        const decoded = Buffer.isBuffer(chunk)
            ? this._decoder.write(chunk)
            : chunk;
        this._outputChannel.append(decoded);
        callback();
    }

    _final(callback: (error?: Error | null | undefined) => void): void {
        this._outputChannel.append(this._decoder.end());
        callback();
    }
}
