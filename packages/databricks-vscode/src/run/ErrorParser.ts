/* eslint-disable no-control-regex */
import {compute} from "@databricks/sdk-experimental";
import * as assert from "node:assert";

export interface Frame {
    file?: string;
    line?: number;
    text: string;
}

/**
 * Boundary token separating the script's captured stdout from the structured
 * error payload that `bootstrap.py` emits when a script fails after printing.
 * The same literal is injected into `bootstrap.py` at command-assembly time.
 */
export const STDOUT_ERROR_BOUNDARY =
    "__DATABRICKS_VSCODE_STDOUT_ERROR_BOUNDARY__";

interface TracebackFrame {
    file?: string;
    line?: number;
    name?: string;
    text?: string;
}

interface ErrorEnvelope {
    type: string;
    message: string;
    frames: Array<TracebackFrame>;
}

/**
 * Render the structured error payload emitted by `bootstrap.py` (see
 * {@link STDOUT_ERROR_BOUNDARY}) into frames shaped like {@link parseErrorResult}'s
 * output, so the caller can remap each frame's `file` to a local path and emit
 * it. Unlike `parseErrorResult`, this does not depend on the platform's IPython
 * traceback formatting, which varies with runtime and source availability.
 */
export function renderErrorEnvelope(payload: string): Array<Frame> {
    let envelope: ErrorEnvelope;
    try {
        envelope = JSON.parse(payload);
    } catch {
        // Malformed payload: surface it verbatim rather than dropping output.
        return [{text: payload.trim()}];
    }

    const frames: Array<Frame> = [{text: "Traceback (most recent call last):"}];
    for (const frame of envelope.frames ?? []) {
        const where = frame.name ? `, in ${frame.name}` : "";
        const location = `  File "${frame.file}", line ${frame.line}${where}`;
        const source = frame.text ? `\n    ${frame.text}` : "";
        frames.push({
            file: frame.file,
            line: frame.line,
            text: location + source,
        });
    }
    // Colour the final summary line red to match the platform's error styling.
    frames.push({
        text: `\u001b[0;31m${envelope.type}: ${envelope.message}\u001b[0m`,
    });
    return frames;
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
