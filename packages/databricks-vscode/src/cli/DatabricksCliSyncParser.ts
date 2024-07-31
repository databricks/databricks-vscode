import {logging} from "@databricks/databricks-sdk";
import {EventEmitter} from "vscode";
import {Loggers} from "../logger";
import {SyncState} from "../sync";

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

export class DatabricksCliSyncParser {
    private state: SyncState = "STOPPED";

    constructor(
        private syncStateCallback: (state: SyncState, reason?: string) => void,
        private writeEmitter: EventEmitter<string>
    ) {}

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
        for (let i = 0; i < logLines.length; i++) {
            const line = logLines[i].trim();
            if (line.length === 0) {
                continue;
            }
            this.writeEmitter.fire(line.trim() + "\r\n");
            if (this.matchForErrors(line)) {
                return;
            }
        }
    }

    private matchForErrors(line: string) {
        if (line.match(/^Error: .*Files in Workspace is disabled.*/) !== null) {
            this.syncStateCallback("FILES_IN_WORKSPACE_DISABLED");
            return true;
        }

        if (line.match(/^Error: .*Files in Repos is disabled.*/) !== null) {
            this.syncStateCallback("FILES_IN_REPOS_DISABLED");
            return true;
        }

        const match = line.match(/^Error: (.*)/);
        if (match !== null) {
            this.syncStateCallback("ERROR", match[1]);
            return true;
        }

        return false;
    }

    // This function processes the JSON output from databricks sync and parses it
    // to figure out if a synchronization step is in progress or has completed.
    public processStdout(data: string) {
        const logLines = data.split("\n");
        for (let i = 0; i < logLines.length; i++) {
            const line = logLines[i].trim();
            if (line.length === 0) {
                continue;
            }

            try {
                this.processLine(line);
            } catch (error: any) {
                logging.NamedLogger.getOrCreate(Loggers.Extension).error(
                    "Error parsing JSON line from databricks sync stdout: " +
                        error
                );
            }

            if (this.matchForErrors(line)) {
                return;
            }
        }

        this.syncStateCallback(this.state);
    }
}
