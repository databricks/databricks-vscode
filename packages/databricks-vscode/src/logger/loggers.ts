import {
    NamedLogger,
    ExposedLoggers,
} from "@databricks/databricks-sdk/dist/logging";
import {OutputChannel, window} from "vscode";
import {loggers, format, transports} from "winston";
import {OutputConsoleStream} from "./OutputConsoleStream";
import {LEVEL, MESSAGE, SPLAT} from "triple-beam";
import {workspace} from "vscode";

function getOutputConsoleTransport(outputChannel: OutputChannel) {
    return new transports.Stream({
        format: format.combine(
            format.timestamp(),
            format((info) => {
                const stripped = Object.assign({}, info) as any;
                if (stripped[LEVEL] === "error") {
                    return info;
                }
                delete stripped[LEVEL];
                delete stripped[MESSAGE];
                delete stripped[SPLAT];
                delete stripped["level"];
                delete stripped["message"];
                delete stripped["timestamp"];

                for (let key in stripped) {
                    let valueStr: string =
                        typeof stripped[key] === "string"
                            ? stripped[key]
                            : JSON.stringify(stripped[key]);
                    const maxFieldLength =
                        workspace
                            .getConfiguration("databricks.logs")
                            ?.get<number>("maxFieldLength") ?? 40;
                    if (valueStr.length >= maxFieldLength) {
                        info[key] = `${valueStr.slice(0, maxFieldLength)} ...(${
                            valueStr.length - maxFieldLength
                        } more bytes)`;
                    }
                }
                return info;
            })(),
            format.prettyPrint({depth: 2})
        ),
        stream: new OutputConsoleStream(outputChannel, {
            defaultEncoding: "utf-8",
        }),
    });
}

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
