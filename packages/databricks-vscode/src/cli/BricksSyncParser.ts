import {EventEmitter} from "vscode";
import {SyncState} from "../sync";

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
        const indexOfAction = line.indexOf("Action:");
        // The log line is not relevant for actions
        if (indexOfAction === -1) {
            return;
        }

        const tokenizedLine = line.substring(indexOfAction).split(" ");
        let isPut = false;
        let isDelete = false;
        for (let i = 1; i < tokenizedLine.length; i++) {
            switch (tokenizedLine[i]) {
                case "PUT:": {
                    isPut = true;
                    isDelete = false;
                    break;
                }
                case "DELETE:": {
                    isDelete = true;
                    isPut = false;
                    break;
                }
                default: {
                    // trim the trailing , if it exists
                    const filePath = tokenizedLine[i].replace(/,$/, "");
                    if (isPut) {
                        this.filesBeingUploaded.add(filePath);
                    } else if (isDelete) {
                        this.filesBeingDeleted.add(filePath);
                    } else {
                        throw new Error(
                            "[BricksSyncParser] unexpected logs recieved"
                        );
                    }
                }
            }
        }
    }

    // We expect a single line of logs for all files being put/delete
    private parseForUploadCompleted(line: string) {
        const indexOfUploaded = line.indexOf("Uploaded");
        if (indexOfUploaded === -1) {
            return;
        }

        const tokenizedLine = line.substring(indexOfUploaded).split(" ");
        if (tokenizedLine.length !== 2) {
            throw new Error("[BricksSyncParser] unexpected logs recieved");
        }
        const filePath = tokenizedLine[1];
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
        const indexOfDeleted = line.indexOf("Deleted");
        if (indexOfDeleted === -1) {
            return;
        }

        const tokenizedLine = line.substring(indexOfDeleted).split(" ");
        if (tokenizedLine.length !== 2) {
            throw new Error("[BricksSyncParser] unexpected logs recieved");
        }
        const filePath = tokenizedLine[1];
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
        for (let i = 0; i < logLines.length; i++) {
            const line = logLines[i];
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
