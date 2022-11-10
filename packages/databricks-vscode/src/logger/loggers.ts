import {
    NamedLogger,
    ExposedLoggers,
} from "@databricks/databricks-sdk/dist/logging";
import {window} from "vscode";
import {loggers, format, transports} from "winston";
import {getOutputConsoleTransport} from "./outputConsoleTransport";
import {unlink, access} from "fs/promises";
import {workspaceConfigs} from "../WorkspaceConfigs";

function getFileTransport(filename: string) {
    return new transports.File({
        format: format.combine(format.timestamp(), format.json()),
        filename: filename,
    });
}

export async function initLoggers(rootPath: string) {
    if (!workspaceConfigs.loggingEnabled) {
        return;
    }

    const outputChannel = window.createOutputChannel("Databricks Logs");
    const logFile = `${rootPath}/.databricks/logs.json`;
    try {
        await access(logFile);
        await unlink(logFile);
    } catch (e) {}

    outputChannel.clear();

    NamedLogger.getOrCreate(
        ExposedLoggers.SDK,
        {
            factory: (name) => {
                return loggers.add(name, {
                    level: "debug",
                    transports: [
                        getOutputConsoleTransport(outputChannel),
                        getFileTransport(logFile),
                    ],
                });
            },
        },
        true
    );

    /** 
    This logger collects all the logs in the extension.
    
    TODO Make this logger log to a seperate (or common?) output console in vscode
    */
    NamedLogger.getOrCreate(
        "Extension",
        {
            factory: (name) => {
                return loggers.add(name, {
                    level: "error",
                    transports: [
                        getOutputConsoleTransport(outputChannel),
                        getFileTransport(logFile),
                    ],
                });
            },
        },
        true
    );
}

export enum Loggers {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Extension = "Extension",
}
