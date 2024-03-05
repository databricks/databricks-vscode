import {CancellationTokenSource, Disposable, Terminal, window} from "vscode";
import {BundleRemoteStateModel} from "../models/BundleRemoteStateModel";
import {CustomOutputTerminal} from "./CustomOutputTerminal";

export class BundleRunTerminalManager implements Disposable {
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

    constructor(
        private readonly bundleRemoteStateModel: BundleRemoteStateModel
    ) {}

    getTerminalName(target: string, resourceKey: string) {
        return `Run ${resourceKey} (${target})`;
    }

    async run(
        resourceKey: string,
        onDidUpdate?: (data: string) => void
    ): Promise<{exitCode?: number | null; cancelled: boolean}> {
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
                }, this.disposables);

            const cmd = this.bundleRemoteStateModel.getRunCommand(resourceKey);

            // spawn a new process with the latest command, in the same terminal.
            terminal.pty.spawn(cmd);
            terminal.terminal.show();

            disposables.push(
                terminal.pty.onDidWrite((data) => {
                    onDidUpdate?.(data);
                })
            );

            // Wait for the process to exit
            return await new Promise((resolve, reject) => {
                if (terminal === undefined) {
                    resolve({cancelled: true});
                    return;
                }
                terminal.pty.onDidCloseProcess((exitCode) => {
                    if (exitCode === 0 || terminal.pty.isClosed) {
                        // Resolve when the process exits with code 0 or is closed by human action
                        resolve({exitCode, cancelled: terminal.pty.isClosed});
                    } else {
                        reject(
                            new Error(`Process exited with code ${exitCode}`)
                        );
                    }
                }, disposables);
                window.onDidCloseTerminal((e) => {
                    // Resolve when the process is closed by human action
                    e.name === terminal.terminal.name &&
                        resolve({cancelled: true});
                }, disposables);
            });
        } finally {
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
        window.terminals.find((i) => i.name === terminalName)?.show();

        this.cancellationTokenSources.get(terminalName)?.cancel();
        this.cancellationTokenSources.get(terminalName)?.dispose();
        this.cancellationTokenSources.delete(terminalName);
    }

    dispose() {
        this.disposables.forEach((i) => i.dispose());
    }
}
