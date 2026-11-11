// No VS Code imports here: scripts/generateTelemetry.mjs loads these
// definitions under plain Node.

export type EventProperties = Record<string, string | number | boolean | object | undefined>;

type PropertyComments<P> = { [K in keyof P]-?: { comment: string } };

/**
 * A telemetry event. Features declare theirs in a `telemetry.ts` and list them
 * in `Feature.telemetryEvents`; `telemetry.json` is generated from all of
 * them. Names are the old extension's, so dashboards keep working.
 */
export interface TelemetryEvent<P extends EventProperties | undefined> {
    readonly name: string;
    readonly comment: string;
    readonly properties: P extends EventProperties ? PropertyComments<P> : Record<string, never>;
    /** Only for type inference. */
    readonly _props?: P;
}

export function telemetryEvent<P extends EventProperties | undefined = undefined>(
    name: string,
    comment: string,
    ...properties: P extends EventProperties ? [PropertyComments<P>] : []
): TelemetryEvent<P> {
    return {
        name,
        comment,
        properties: ((properties as unknown[])[0] ?? {}) as TelemetryEvent<P>["properties"],
    };
}

/** A duration, in milliseconds; `Telemetry.start` measures it. */
export type DurationMeasurement = { duration: number };

export const durationComment = {
    duration: { comment: "The duration of the event, in milliseconds" },
};

type EnvironmentType = "tests" | "prod";
export type ExtensionMode = "remote" | "normal";
/** Which code base sent the event, so version 3 can be compared with 2.x. */
type ExtensionFlavor = "next";

/** Metadata attached to every event, under the `user.` and `context.` prefixes. */
export interface MetadataTypes {
    user: {
        hashedUserName: string;
        host: string;
        workspaceId: string;
        authType: string;
    };
    context: {
        environmentType: EnvironmentType;
        mode: ExtensionMode;
        flavor: ExtensionFlavor;
    };
}

export const metadataDefinitions: {
    [M in keyof MetadataTypes]: PropertyComments<MetadataTypes[M]>;
} = {
    user: {
        hashedUserName: {
            comment: "A hash of the user name computed using bcrypt",
        },
        host: {
            comment: "The hostname of the workspace that the user is connected to",
        },
        workspaceId: { comment: "The id of the workspace" },
        authType: { comment: "The kind of authentication used by the user" },
    },
    context: {
        environmentType: {
            comment:
                "A type of the environment this extension is running with (test, staging, prod)",
        },
        mode: {
            comment:
                "Whether the extension activated in remote (Databricks Remote SSH) or normal mode",
        },
        flavor: {
            comment: "Which code base sent the event: 'next' for version 3; absent for 2.x",
        },
    },
};
