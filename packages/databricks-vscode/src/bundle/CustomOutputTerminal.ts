import {ChildProcess, SpawnOptions, spawn} from "child_process";
import {Pseudoterminal, Event, EventEmitter} from "vscode";

export class CustomOutputTerminal implements Pseudoterminal {
    private writeEmitter = new EventEmitter<string>();
    onDidWrite: Event<string> = this.writeEmitter.event;

    private closeEmitter = new EventEmitter<number | void>();
    onDidClose: Event<number | void> = this.closeEmitter.event;

    private onDidCloseProcessEmitter = new EventEmitter<number | null>();
    onDidCloseProcess: Event<number | null> =
        this.onDidCloseProcessEmitter.event;

    private _process: ChildProcess | undefined;
    public get process(): ChildProcess | undefined {
        return this._process;
    }

    constructor() {}

    open(): void {}

    spawn({
        cmd,
        args,
        options,
    }: {
        cmd: string;
        args: string[];
        options: SpawnOptions;
    }): void {
        this.writeEmitter.fire("\x1b[2J\x1b[H");
        this._process = spawn(cmd, args, options);
        if (!this.process) {
            throw new Error("Can't start process: process is undefined");
        }

        if (!this.process.stderr) {
            throw new Error("Can't start process: can't pipe stderr process");
        }

        if (!this.process.stdout) {
            throw new Error("Can't start process: can't pipe stdout process");
        }

        this.process.stdout.on("data", (data) => {
            let dataStr = data.toString();
            dataStr = dataStr.replaceAll("\n", "\r\n");
            if (!dataStr.endsWith("\r\n")) {
                dataStr = dataStr + "\r\n";
            }
            this.writeEmitter.fire(dataStr);
        });

        this.process.stderr.on("data", (data) => {
            let dataStr: string = data.toString();
            dataStr = dataStr.replaceAll("\n", "\r\n");
            if (!dataStr.endsWith("\r\n")) {
                dataStr = dataStr + "\r\n";
            }
            this.writeEmitter.fire(dataStr);
        });

        this.process.on("close", (exitCode) => {
            this.onDidCloseProcessEmitter.fire(exitCode);
            this._process = undefined;
        });

        this.process.on("error", (err) => {
            this.writeEmitter.fire("\x1b[31m" + err.message + "\x1b[0m\r\n");
            this.writeEmitter.fire(
                "\x1b[31m" + (err.stack ?? "") + "\x1b[0m\r\n"
            );
        });
    }

    close(): void {
        if (this.process !== undefined) {
            this.writeEmitter.fire(
                "\x1b[31mProcess killed by user input\x1b[0m\r\n"
            );
        }
        this.process?.kill();
    }
}
