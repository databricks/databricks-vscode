import {CodeSynchronizer} from "./CodeSynchronizer";

export class SyncCommands {
    constructor(private sync: CodeSynchronizer) {}

    stopCommand() {
        return () => {
            this.sync.stop();
        };
    }

    startCommand(syncType: "full" | "incremental") {
        return async () => {
            await this.sync.start(syncType);
        };
    }
}
