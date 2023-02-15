import {LEVELS, NamedLogger} from "@databricks/databricks-sdk/dist/logging";
import {EventEmitter} from "vscode";
import {Loggers} from "../logger";
import {SyncState} from "../sync";

const bricksLogLevelToSdk = new Map<string, LEVELS>([
    ["DEBUG", LEVELS.debug],
    ["INFO", LEVELS.info],
    ["WARN", LEVELS.warn],
    ["ERROR", LEVELS.error],
]);

export class BricksSyncParser {
    private filesBeingUploaded = new Set<string>();
    private filesBeingDeleted = new Set<string>();
    private firstSyncDone = false;

    constructor(
        private syncStateCallback: (state: SyncState) => void,
        private writeEmitter: EventEmitter<string>
    ) {}

    // Assumes we recieve a single line of bricks logs
    // A value bricks action looks like this
    // const s1 = "Action: PUT: g, .gitignore, DELETE: f"
    // A hacky way to solve this, lets move to structed logs from bricks later
    private parseForActionsInitiated(line: string) {
        const match = line.match(/Action:( PUT: (.*?))?( DELETE: (.*?))?$/);
        if (!match) {
            return;
        }

        const toAdd = match[2]?.split(", ");
        const toDelete = match[4]?.split(", ");

        toAdd?.forEach((f) => this.filesBeingUploaded.add(f));
        toDelete?.forEach((f) => this.filesBeingDeleted.add(f));
    }

    // We expect a single line of logs for all files being put/delete
    private parseForUploadCompleted(line: string) {
        const match = line.match(/Uploaded (.*)/);
        if (!match) {
            return;
        }

        const filePath = match[1];
        if (!this.filesBeingUploaded.has(filePath)) {
            throw new Error(
                "[BricksSyncParser] untracked file uploaded. All upload complete " +
                    "logs should be preceded with a uploaded initialted log. file: " +
                    filePath +
                    ". log recieved: `" +
                    line +
                    "`"
            );
        }
        this.filesBeingUploaded.delete(filePath);
    }

    private parseForDeleteCompleted(line: string) {
        const match = line.match(/Deleted (.*)/);
        if (!match) {
            return;
        }

        const filePath = match[1];
        if (!this.filesBeingDeleted.has(filePath)) {
            throw new Error(
                "[BricksSyncParser] untracked file deleted. All delete complete " +
                    "logs should be preceded with a delete initialted log. file: " +
                    filePath +
                    ". log recieved: `" +
                    line +
                    "`"
            );
        }
        this.filesBeingDeleted.delete(filePath);
    }

    // We block on execing any commands on vscode until we get a message from
    // bricks cli that the initial sync is done
    private parseForFirstSync(line: string) {
        const indexOfSyncComplete = line.indexOf("Initial Sync Complete");
        if (indexOfSyncComplete !== -1) {
            this.firstSyncDone = true;
        }
    }

    // This function processes the stderr logs from bricks sync and parses it
    // to compute the sync state ie determine whether the remote files match
    // what we have stored locally.
    // TODO: Use structed logging to compute the sync state here
    public process(data: string) {
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

            this.parseForActionsInitiated(line);
            this.parseForUploadCompleted(line);
            this.parseForDeleteCompleted(line);

            if (!this.firstSyncDone) {
                this.parseForFirstSync(line);
            }

            // this.writeEmitter.fire writes to the pseudoterminal for the
            // bricks sync process
            this.writeEmitter.fire(line.trim());

            // When vscode flush prints the logs from events fired here,
            // it automatically adds a new line. Since we can reasonably expect
            // with a high probablity that all logs in one call of this process(data) func will
            // be flushed together, we do not add a new line at the last event
            // to keep the new line spacing consistant
            if (i !== logLines.length - 1) {
                this.writeEmitter.fire("\n\r");
            }
        }
        if (
            this.filesBeingDeleted.size === 0 &&
            this.filesBeingUploaded.size === 0 &&
            this.firstSyncDone
        ) {
            this.syncStateCallback("WATCHING_FOR_CHANGES");
        } else {
            this.syncStateCallback("IN_PROGRESS");
        }
    }
}
