/* eslint-disable no-control-regex */
import {compute} from "@databricks/databricks-sdk";
import * as assert from "node:assert";

interface Frame {
    file?: string;
    line?: number;
    text: string;
}

export function parseErrorResult(result: compute.Results): Array<Frame> {
    assert.equal(result.resultType, "error");

    const cause = result.cause || "";
    const summary = result.summary || "";

    const errorType = typeFromSummary(summary);
    let frames: Array<Frame> = [];

    switch (errorType) {
        case "syntax":
            frames = processSyntaxError(cause);
            break;

        case "exception":
            frames = processException(cause);
            break;

        default:
            frames = processException(cause);
            break;
    }

    return frames;
}

function typeFromSummary(summary: string): "syntax" | "exception" | "unknown" {
    if (summary.includes(">SyntaxError<")) {
        return "syntax";
    } else if (summary.includes(">Exception<")) {
        return "exception";
    } else {
        return "unknown";
    }
}

export function processException(cause: string): Frame[] {
    const chunks = cause.split(/\n(?:\u001b\[0m)?\n/);

    // only take header of the first chunk
    chunks[0] = chunks[0].split("\n").slice(0, 2).join("\n");

    const frames = [];
    for (const chunk of chunks) {
        if (!chunk) {
            continue;
        }
        const cleanChunk = chunk.replace(/\u001b\[\d+(?:;\d+)*m/g, "");

        const match =
            cleanChunk.match(/^(\/.*?\.py) in\s/u) ||
            cleanChunk.match(/File (\/.*?\.py)/u);
        if (match) {
            const lineMatch = cleanChunk.match(/^-+>\s(\d+)/mu);

            frames.push({
                file: match[1],
                line: lineMatch ? parseInt(lineMatch[1]) : 0,
                text: chunk,
            });
        } else {
            frames.push({
                text: chunk,
            });
        }
    }

    return filterFrames(frames);
}

function processSyntaxError(cause: string): Frame[] {
    const chunks = cause.split(/\n(?:\u001b\[0m)?\n/);
    const frames: Frame[] = [];

    for (const chunk of chunks) {
        const cleanChunk = chunk.replace(/\u001b\[\d+(?:;\d+)*m/g, "");
        const match =
            cleanChunk.match(/^\s*File\s*"(.*?)", line (\d+)/u) ||
            cleanChunk.match(/File (\/.*?\.py):(\d+)/u);
        if (match) {
            frames.push({
                file: match[1],
                line: parseInt(match[2]),
                text: chunk,
            });
        } else {
            frames.push({text: chunk});
        }
    }

    return filterFrames(frames);
}

function filterFrames(frames: Array<Frame>): Array<Frame> {
    return frames.filter((frame) => {
        return (
            !frame.file?.endsWith("/interactiveshell.py") &&
            !frame.file?.endsWith(
                "PythonPackageImportsInstrumentation/__init__.py"
            ) &&
            !frame.file?.match(/<command--\d+>/)
        );
    });
}
