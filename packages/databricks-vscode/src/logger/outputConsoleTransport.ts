import {OutputChannel, workspace} from "vscode";
import {transports, format} from "winston";
import {OutputConsoleStream} from "./OutputConsoleStream";
import {LEVEL, MESSAGE, SPLAT} from "triple-beam";
import {info} from "console";

const workspaceConfigs = {
    get maxFieldLength() {
        return (
            workspace
                .getConfiguration("databricks")
                ?.get<number>("logs.maxFieldLength") ?? 40
        );
    },
    get truncationDepth() {
        return (
            workspace
                .getConfiguration("databricks")
                ?.get<number>("logs.truncationDepth") ?? 2
        );
    },
    get maxArrayLength() {
        return (
            workspace
                .getConfiguration("databricks")
                ?.get<number>("logs.maxArrayLength") ?? 2
        );
    },
};

function processPrimitiveOrString(obj: any) {
    let valueStr: string;
    if (Object(obj) !== obj) {
        valueStr = typeof obj === "string" ? obj : String(obj).toString();
    } else {
        valueStr = JSON.stringify(obj);
    }

    return valueStr.length > workspaceConfigs.maxFieldLength
        ? `${valueStr.slice(0, workspaceConfigs.maxFieldLength)} ...(${
              valueStr.length - workspaceConfigs.maxFieldLength
          } bytes more)`
        : valueStr;
}

function processArray(obj: Array<any>, depth: number): Array<any> {
    const finalArr = [];
    for (let child of obj) {
        finalArr.push(recursiveTruncate(child, depth - 1));
        if (finalArr.length === workspaceConfigs.maxArrayLength) {
            break;
        }
    }
    if (obj.length > workspaceConfigs.maxArrayLength) {
        finalArr.push(
            `...${obj.length - workspaceConfigs.maxArrayLength} more items`
        );
    }
    return finalArr;
}

function recursiveTruncate(obj: any, depth: number) {
    //If object is of primitive type
    if (Object(obj) !== obj || depth === 0) {
        return processPrimitiveOrString(obj);
    }

    if (Array.isArray(obj)) {
        return processArray(obj, depth);
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

                return {
                    ...info,
                    ...recursiveTruncate(
                        stripped,
                        workspaceConfigs.truncationDepth
                    ),
                    timestamp: new Date().toLocaleString(),
                };
            })(),
            format.prettyPrint({depth: workspaceConfigs.truncationDepth})
        ),
        stream: new OutputConsoleStream(outputChannel, {
            defaultEncoding: "utf-8",
        }),
    });
}
