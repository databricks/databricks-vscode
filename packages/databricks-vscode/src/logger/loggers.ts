import {
    NamedLogger,
    ExposedLoggers,
} from "@databricks/databricks-sdk/dist/logging";
import {window} from "vscode";
import {loggers, format, transports} from "winston";
import {getOutputConsoleTransport} from "./outputConsoleTransport";

function getFileTransport(filename: string) {
    return new transports.File({
        format: format.combine(format.timestamp(), format.json()),
        filename: filename,
    });
}

export function initLoggers(rootPath: string) {
    const outputChannel = window.createOutputChannel("Databricks Logs");
    outputChannel.clear();

    NamedLogger.getOrCreate(
        ExposedLoggers.SDK,
        {
            factory: (name) => {
                return loggers.add(name, {
                    level: "debug",
                    transports: [
                        getOutputConsoleTransport(outputChannel),
                        getFileTransport(`${rootPath}/.databricks/logs.txt`),
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
                        getFileTransport(`${rootPath}/.databricks/logs.txt`),
                    ],
                });
            },
        },
        true
    );
}
