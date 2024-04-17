import {ChildProcess, SpawnOptions, spawn} from "child_process";
import {quote} from "shell-quote";
import {Pseudoterminal, Event, EventEmitter} from "vscode";

export class CustomOutputTerminal implements Pseudoterminal {
    /** Is the terminal closed by user action */
    public isClosed = false;
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
        this.isClosed = false;
        this.writeEmitter.fire("\x1b[2J\x1b[H\r\n");
        this.writeEmitter.fire(quote([cmd, ...args]) + "\r\n\r\n");

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

        const handleOutput = (data: Buffer) => {
            let dataStr = data.toString();
            dataStr = dataStr.replaceAll("\n", "\r\n");
            if (!dataStr.endsWith("\r\n")) {
                dataStr = dataStr + "\r\n";
            }
            this.writeEmitter.fire(dataStr);
        };
        this.process.stdout.on("data", handleOutput);
        this.process.stderr.on("data", handleOutput);

        this.process.on("close", async (exitCode) => {
            if (exitCode === 0) {
                this.writeEmitter.fire(
                    "\x1b[32mProcess completed successfully\x1b[0m\r\n"
                );
            }

            if (exitCode !== 0 && exitCode !== null) {
                this.writeEmitter.fire(
                    "\x1b[31mProcess exited with code " +
                        exitCode +
                        "\x1b[0m\r\n"
                );
                // Wait for 2 seconds to let the error rendering finish
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }

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
        this.isClosed = true;
        if (this.process !== undefined) {
            this.writeEmitter.fire(
                "\x1b[31mProcess killed by user input\x1b[0m\r\n"
            );
        }
        this.process?.kill();
    }
}
