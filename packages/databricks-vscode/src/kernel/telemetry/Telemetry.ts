import type { EventProperties, MetadataTypes, TelemetryEvent } from "./definitions";

/**
 * The version of the schema of the properties sent with every event. Bump the
 * minor version for forward-compatible changes, such as a new field, and the
 * major version for incompatible ones.
 *
 * Version 1.0:
 * properties: {
 *     "version": "1.0",
 *     "user.*": see MetadataTypes.user,
 *     "context.*": see MetadataTypes.context,
 *     "event.*": properties of the event,
 * }
 * measurements: {
 *     "event.*": numeric properties of the event,
 * }
 */
const TELEMETRY_VERSION = "1.0";

/** The subset of `@vscode/extension-telemetry`'s `TelemetryReporter` we use. */
export interface TelemetryReporter {
    readonly telemetryLevel: "all" | "error" | "crash" | "off";
    sendTelemetryEvent(
        eventName: string,
        properties?: Record<string, string>,
        measurements?: Record<string, number>,
    ): void;
    dispose(): Promise<unknown>;
}

type PropsArgs<P extends EventProperties | undefined> = P extends EventProperties ? [P] : [];

/** What features get: recording only. */
export interface TelemetryRecorder {
    /**
     * Whether ordinary events are sent. Skip work done only to build an event
     * when this is false.
     */
    readonly isEnabled: boolean;
    record<P extends EventProperties | undefined>(
        event: TelemetryEvent<P>,
        ...props: PropsArgs<P>
    ): void;
    /** Starts a clock; the returned function records the event with its duration. */
    start<P extends EventProperties & { duration: number }>(
        event: TelemetryEvent<P>,
    ): (props: Omit<P, "duration">) => void;
}

export class Telemetry implements TelemetryRecorder {
    private metadata: { [M in keyof MetadataTypes]?: Partial<MetadataTypes[M]> } = {};

    constructor(
        private readonly reporter: TelemetryReporter | undefined,
        private readonly now: () => number = () => performance.now(),
    ) {}

    get isEnabled(): boolean {
        return this.reporter?.telemetryLevel === "all";
    }

    setMetadata<M extends keyof MetadataTypes>(prefix: M, properties: Partial<MetadataTypes[M]>) {
        this.metadata[prefix] = properties;
    }

    record<P extends EventProperties | undefined>(
        event: TelemetryEvent<P>,
        ...props: PropsArgs<P>
    ): void {
        if (this.reporter === undefined) {
            return;
        }
        const properties: Record<string, string> = { version: TELEMETRY_VERSION };
        const measurements: Record<string, number> = {};
        const add = (source: object | undefined, prefix: string) => {
            for (const [k, v] of Object.entries(source ?? {})) {
                const key = `${prefix}.${k}`;
                if (v === undefined) {
                    continue;
                } else if (typeof v === "number") {
                    measurements[key] = v;
                } else if (typeof v === "string") {
                    properties[key] = v;
                } else if (typeof v === "object") {
                    properties[key] = JSON.stringify(v);
                } else {
                    properties[key] = String(v);
                }
            }
        };
        add((props as unknown[])[0] as object | undefined, "event");
        for (const [prefix, values] of Object.entries(this.metadata)) {
            add(values, prefix);
        }
        this.reporter.sendTelemetryEvent(event.name, properties, measurements);
    }

    start<P extends EventProperties & { duration: number }>(
        event: TelemetryEvent<P>,
    ): (props: Omit<P, "duration">) => void {
        const start = this.now();
        return (props) => {
            const full = { ...props, duration: this.now() - start } as unknown as P;
            this.record<EventProperties>(event as unknown as TelemetryEvent<EventProperties>, full);
        };
    }

    dispose(): Promise<unknown> {
        return this.reporter?.dispose() ?? Promise.resolve();
    }
}
