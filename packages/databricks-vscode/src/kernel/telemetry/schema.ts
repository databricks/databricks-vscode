// No VS Code imports here: scripts/generateTelemetry.mjs loads this under
// plain Node, from dist/.
import fs from "node:fs";
import path from "node:path";
import { metadataDefinitions } from "./definitions";

/** One event in `telemetry.json`: its comment, and each property's. */
type EventEntry = { comment: string } & Record<string, unknown>;

/**
 * The modules that declare events, under `root` (`src` or `dist`) with
 * extension `ext`: the core events and each feature's `telemetry` module.
 * The generator can't load the features themselves, which need VS Code.
 */
export function telemetryModuleFiles(root: string, ext: ".ts" | ".js"): string[] {
    const features = path.join(root, "features");
    return [
        path.join(root, "kernel", "telemetry", `events${ext}`),
        ...fs
            .readdirSync(features)
            .sort()
            .map((feature) => path.join(features, feature, `telemetry${ext}`))
            .filter((file) => fs.existsSync(file)),
    ];
}

/**
 * The content of `telemetry.json`, which VS Code's `code --telemetry` reads
 * from the extension's folder: every event the modules export, by name, and
 * the metadata sent with each.
 */
export function telemetrySchema(modules: readonly Record<string, unknown>[]): {
    events: Record<string, EventEntry>;
    metadata: typeof metadataDefinitions;
} {
    const events: Record<string, EventEntry> = {};
    for (const module of modules) {
        for (const value of Object.values(module)) {
            if (!isEvent(value)) {
                continue;
            }
            if (events[value.name] !== undefined) {
                throw new Error(`Telemetry event ${value.name} is declared twice`);
            }
            events[value.name] = { comment: value.comment, ...value.properties };
        }
    }
    return {
        events: Object.fromEntries(Object.entries(events).sort(([a], [b]) => a.localeCompare(b))),
        metadata: metadataDefinitions,
    };
}

function isEvent(value: unknown): value is {
    name: string;
    comment: string;
    properties: Record<string, unknown>;
} {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const event = value as Record<string, unknown>;
    return (
        typeof event.name === "string" &&
        typeof event.comment === "string" &&
        typeof event.properties === "object" &&
        event.properties !== null
    );
}
