import type { Disposable, Event, Pseudoterminal, Terminal, window as vscodeWindow } from "vscode";
import { Emitter } from "../../../platform/event";

type TerminalWindow = Pick<typeof vscodeWindow, "createTerminal" | "terminals">;

/** A display-only quoting of the command line, as the old terminal printed it. */
export function quoteCommandLine(args: readonly string[]): string {
    return args
        .map((a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replaceAll("'", `'\\''`)}'`))
        .join(" ");
}

/**
 * The pseudo-terminal "Run <key> (<target>)" that shows `bundle run`'s output
 * (the old `CustomOutputTerminal`). It runs nothing itself: the CLI runs on
 * the process seam, and its output is written here. Closing the terminal
 * while a run is in progress cancels the run.
 */
export class RunTerminal implements Pseudoterminal, Disposable {
    private readonly written = new Emitter<string>();
    private readonly closed = new Emitter<number | void>();
    private readonly closedByUser = new Emitter<void>();
    readonly onDidWrite: Event<string> = this.written.event;
    readonly onDidClose: Event<number | void> = this.closed.event;
    /** The user closed the terminal. */
    readonly onDidCloseByUser: Event<void> = this.closedByUser.event;
    /** A run is writing to it. */
    running = false;
    isClosed = false;

    open(): void {}

    close(): void {
        this.isClosed = true;
        if (this.running) {
            this.written.fire("\x1b[31mProcess killed by user input\x1b[0m\r\n");
        }
        this.closedByUser.fire();
    }

    /** Clears the screen and prints the command line. */
    started(commandLine: string): void {
        this.running = true;
        this.written.fire("\x1b[2J\x1b[H\r\n");
        this.written.fire(`${commandLine}\r\n\r\n`);
    }

    write(chunk: string): void {
        let text = chunk.replace(/\r?\n/g, "\r\n");
        if (!text.endsWith("\r\n")) {
            text += "\r\n";
        }
        this.written.fire(text);
    }

    /** The CLI exited: with its code, or `null` when it was killed. */
    exited(exitCode: number | null): void {
        this.running = false;
        if (exitCode === 0) {
            this.written.fire("\x1b[32mProcess completed successfully\x1b[0m\r\n");
        } else if (exitCode !== null) {
            this.written.fire(`\x1b[31mProcess exited with code ${exitCode}\x1b[0m\r\n`);
        }
    }

    dispose(): void {
        this.written.dispose();
        this.closed.dispose();
        this.closedByUser.dispose();
    }
}

/** One terminal per name, created again when the user has closed it. */
export class RunTerminals implements Disposable {
    private readonly terminals = new Map<string, { terminal: Terminal; pty: RunTerminal }>();

    constructor(private readonly window: TerminalWindow) {}

    open(name: string): RunTerminal {
        let entry = this.terminals.get(name);
        if (
            entry === undefined ||
            entry.pty.isClosed ||
            !this.window.terminals.includes(entry.terminal)
        ) {
            entry?.pty.dispose();
            const pty = new RunTerminal();
            entry = { pty, terminal: this.window.createTerminal({ name, pty, isTransient: true }) };
            this.terminals.set(name, entry);
        }
        entry.terminal.show();
        return entry.pty;
    }

    /** Shows the terminal, if it is open. */
    show(name: string): void {
        this.terminals.get(name)?.terminal.show();
    }

    dispose(): void {
        for (const { terminal, pty } of this.terminals.values()) {
            terminal.dispose();
            pty.dispose();
        }
        this.terminals.clear();
    }
}
