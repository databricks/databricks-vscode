import {
    NamedLogger,
    ExposedLoggers,
} from "@databricks/databricks-sdk/dist/logging";
import {OutputChannel, window} from "vscode";
import {loggers, format, transports} from "winston";
import {OutputConsoleStream} from "./OutputConsoleStream";

function getOutputConsoleTransport(outputChannel: OutputChannel) {
    return new transports.Stream({
        stream: new OutputConsoleStream(outputChannel, {
            defaultEncoding: "utf-8",
        }),
    });
}
export function initLoggers() {
    const outputChannel = window.createOutputChannel("Databricks Logs", "json");
    outputChannel.clear();

    NamedLogger.getOrCreate(
        ExposedLoggers.SDK,
        {
            factory: (name) => {
                return loggers.add(name, {
                    level: "debug",
                    format: format.json(),
                    transports: [getOutputConsoleTransport(outputChannel)],
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
                    format: format.json(),
                    transports: [getOutputConsoleTransport(outputChannel)],
                });
            },
        },
        true
    );
}
