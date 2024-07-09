import {SyncType} from "../cli/CliWrapper";
import {CodeSynchronizer} from "./CodeSynchronizer";

export class SyncCommands {
    constructor(private sync: CodeSynchronizer) {}

    stopCommand() {
        return () => {
            this.sync.stop();
        };
    }

    startCommand(syncType: SyncType) {
        return async () => {
            await this.sync.start(syncType);
        };
    }
}
