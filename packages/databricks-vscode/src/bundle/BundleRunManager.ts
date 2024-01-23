import {
    CancellationTokenSource,
    Disposable,
    EventEmitter,
    Terminal,
    window,
} from "vscode";
import {BundleRemoteStateModel} from "./models/BundleRemoteStateModel";
import {CustomOutputTerminal} from "./CustomOutputTerminal";
import {Mutex} from "../locking";

export class BundleRunManager implements Disposable {
    private onDidChangeEmitter = new EventEmitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    private disposables: Disposable[] = [];
    private terminalDetails: Map<
        string,
        {
            terminal: Terminal;
            pty: CustomOutputTerminal;
        }
    > = new Map();

    private cancellationTokenSources: Map<string, CancellationTokenSource> =
        new Map();

    private _isRunning: Map<string, boolean> = new Map();
    private isRunningMutex = new Mutex();

    isRunning(resourceKey: string) {
        const target = this.bundleRemoteStateModel.target;
        if (target === undefined) {
            return false;
        }
        const terminalName = this.getTerminalName(target, resourceKey);
        return this._isRunning.get(terminalName) ?? false;
    }
    constructor(
        private readonly bundleRemoteStateModel: BundleRemoteStateModel
    ) {}

    getTerminalName(target: string, resourceKey: string) {
        return `Run ${resourceKey} (${target})`;
    }

    async run(resourceKey: string) {
        const target = this.bundleRemoteStateModel.target;
        if (target === undefined) {
            throw new Error(`Cannot run ${resourceKey}, Target is undefined`);
        }
        const terminalName = this.getTerminalName(target, resourceKey);

        if (!this.terminalDetails.has(terminalName)) {
            this.terminalDetails.set(
                terminalName,
                this.createTerminal(terminalName)
            );
        }
        let terminal = this.terminalDetails.get(terminalName)!;

        const disposables: Disposable[] = [];
        try {
            terminal.terminal.show();
            if (
                window.terminals.find(
                    (i) => i.name === terminal?.terminal.name
                ) === undefined
            ) {
                // The terminal has been closed. Recreate everything.
                terminal = this.createTerminal(terminalName);
                this.terminalDetails.set(terminalName, terminal);
            }
            if (terminal.pty.process !== undefined) {
                // There is already a process running. Raise error
                throw new Error(
                    `Process already running. Pid: ${terminal.pty.process.pid}`
                );
            }
            this.cancellationTokenSources.get(terminalName)?.cancel();
            this.cancellationTokenSources.get(terminalName)?.dispose();
            this.cancellationTokenSources.delete(terminalName);

            const cancellationTokenSource = new CancellationTokenSource();
            this.cancellationTokenSources.set(
                terminalName,
                cancellationTokenSource
            );
            const onCancellationEvent =
                cancellationTokenSource.token.onCancellationRequested(() => {
                    terminal?.pty.close();
                    //Dispose self on cancellation
                    onCancellationEvent.dispose();
                });

            const cmd = this.bundleRemoteStateModel.getRunCommand(resourceKey);

            await this.isRunningMutex.synchronise(async () => {
                this._isRunning.set(terminalName, true);
                this.onDidChangeEmitter.fire();
            });
            // spawn a new process with the latest command, in the same terminal.
            terminal.pty.spawn(cmd);
            terminal.terminal.show();

            // Wait for the process to exit
            await new Promise<void>((resolve, reject) => {
                if (terminal === undefined) {
                    resolve();
                    return;
                }
                disposables.push(
                    terminal.pty.onDidCloseProcess(
                        (exitCode) => {
                            if (exitCode === 0) {
                                resolve();
                            } else {
                                reject(
                                    new Error(
                                        `Process exited with code ${exitCode}`
                                    )
                                );
                            }
                        },
                        window.onDidCloseTerminal((e) => {
                            e.name === terminal.terminal.name &&
                                reject(new Error("Terminal closed"));
                        })
                    )
                );
            });
        } finally {
            await this.isRunningMutex.synchronise(async () => {
                this._isRunning.delete(terminalName);
                this.onDidChangeEmitter.fire();
            });
            disposables.forEach((i) => i.dispose());
            this.cancellationTokenSources.get(terminalName)?.cancel();
            this.cancellationTokenSources.get(terminalName)?.dispose();
            this.cancellationTokenSources.delete(terminalName);
        }
    }

    createTerminal(terminalName: string) {
        const pty = new CustomOutputTerminal();
        const terminal = {
            pty,
            terminal: window.createTerminal({
                name: terminalName,
                pty,
                isTransient: true,
            }),
        };

        this.disposables.push(terminal.terminal);
        return terminal;
    }

    cancel(resourceKey: string) {
        const target = this.bundleRemoteStateModel.target;
        if (target === undefined) {
            throw new Error(
                `Cannot delete ${resourceKey}, Target is undefined`
            );
        }

        const terminalName = this.getTerminalName(target, resourceKey);
        this.cancellationTokenSources.get(terminalName)?.cancel();
        this.cancellationTokenSources.get(terminalName)?.dispose();
        this.cancellationTokenSources.delete(terminalName);
    }

    cancelAll() {
        this.cancellationTokenSources.forEach((cs) => {
            cs.cancel();
        });

        this.cancellationTokenSources.clear();
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
