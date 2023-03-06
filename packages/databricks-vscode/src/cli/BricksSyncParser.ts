import { LEVELS, NamedLogger } from "@databricks/databricks-sdk/dist/logging";
import { EventEmitter } from "vscode";
import { Loggers } from "../logger";
import { SyncState } from "../sync";

const bricksLogLevelToSdk = new Map<string, LEVELS>([
    ["DEBUG", LEVELS.debug],
    ["INFO", LEVELS.info],
    ["WARN", LEVELS.warn],
    ["ERROR", LEVELS.error],
]);

type EventBase = {
    timestamp: string;
    seq: number;
    type: string;
};

type EventChanges = {
    put: Array<string>;
    delete: Array<string>;
};

type EventStart = EventBase &
    EventChanges & {
        type: "start";
    };

type EventComplete = EventBase &
    EventChanges & {
        type: "complete";
    };

type EventProgress = EventBase & {
    type: "progress";

    action: "put" | "delete";
    path: string;
    progress: number;
};

type Event = EventStart | EventComplete | EventProgress;

export class BricksSyncParser {
    private state: SyncState = "STOPPED";

    constructor(
        private syncStateCallback: (state: SyncState) => void,
        private writeEmitter: EventEmitter<string>
    ) { }

    private changeSize(ec: EventChanges): number {
        let size = 0;
        if (ec.put) {
            size += ec.put.length;
        }
        if (ec.delete) {
            size += ec.delete.length;
        }
        return size;
    }

    private processLine(line: string) {
        const event = JSON.parse(line) as Event;
        switch (event.type) {
            case "start": {
                this.state = "IN_PROGRESS";
                this.writeEmitter.fire(
                    "Starting synchronization (" +
                    this.changeSize(event) +
                    " files)\r\n"
                );
                break;
            }
            case "progress": {
                let action = "";
                switch (event.action) {
                    case "put":
                        action = "Uploaded";
                        break;
                    case "delete":
                        action = "Deleted";
                        break;
                }
                if (event.progress === 1.0) {
                    this.writeEmitter.fire(action + " " + event.path + "\r\n");
                }
                break;
            }
            case "complete":
                this.state = "WATCHING_FOR_CHANGES";
                this.writeEmitter.fire("Completed synchronization\r\n");
                break;
        }
    }

    public processStderr(data: string) {
        const logLines = data.split("\n");
        let currentLogLevel: LEVELS = LEVELS.info;
        for (let i = 0; i < logLines.length; i++) {
            const line = logLines[i];
            const typeMatch = line.match(
                /[0-9]+(?:\/[0-9]+)+ [0-9]+(?::[0-9]+)+ \[(.+)\]/
            );
            if (typeMatch) {
                currentLogLevel =
                    bricksLogLevelToSdk.get(typeMatch[1]) ?? currentLogLevel;
            }
            NamedLogger.getOrCreate(Loggers.Bricks).log(currentLogLevel, line);
        }
    }

    // This function processes the JSON output from bricks sync and parses it
    // to figure out if a synchronization step is in progress or has completed.
    public processStdout(data: string) {
        const logLines = data.split("\n");
        for (let i = 0; i < logLines.length; i++) {
            const line = logLines[i];
            try {
                this.processLine(line);
            } catch (error: any) {
                // Log error?
            }
        }

        this.syncStateCallback(this.state);
    }
}
