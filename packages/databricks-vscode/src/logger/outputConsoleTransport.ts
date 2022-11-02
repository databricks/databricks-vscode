import {OutputChannel, workspace} from "vscode";
import {transports, format} from "winston";
import {OutputConsoleStream} from "./OutputConsoleStream";
import {LEVEL, MESSAGE, SPLAT} from "triple-beam";

function recursiveTruncate(obj: any, depth: number) {
    const maxFieldLength =
        workspace
            .getConfiguration("databricks.logs")
            ?.get<number>("maxFieldLength") ?? 40;

    //If object is of primitive type
    if (Object(obj) !== obj || Array.isArray(obj) || depth === 0) {
        let valueStr: string;
        if (Object(obj) !== obj) {
            valueStr = typeof obj === "string" ? obj : String(obj).toString();
        } else {
            valueStr = JSON.stringify(obj);
        }

        return valueStr.length > maxFieldLength
            ? `${valueStr.slice(0, maxFieldLength)} ...(${
                  valueStr.length - maxFieldLength
              } bytes more)`
            : valueStr;
    }

    obj = Object.assign({}, obj);

    for (let key in obj) {
        obj[key] = recursiveTruncate(obj[key], depth - 1);
    }
    return obj;
}

export function getOutputConsoleTransport(outputChannel: OutputChannel) {
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

                return recursiveTruncate(
                    stripped,
                    workspace
                        .getConfiguration("databricks.logs")
                        ?.get<number>("truncationDepth") ?? 2
                );
            })(),
            format.prettyPrint({depth: 2})
        ),
        stream: new OutputConsoleStream(outputChannel, {
            defaultEncoding: "utf-8",
        }),
    });
}
