/**
 * The telemetry contract: the rewrite sends the old extension's
 * events, with the same property names and value types, so the dashboards
 * keep working. `oldTelemetry.ts` is the old declaration; the type checks run
 * in `yarn typecheck`, the name checks in `yarn test`.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import { FEATURES } from "../../features";
import {
    AITOOLS_CURSOR_PLUGIN_PROMPT,
    AITOOLS_INSTALL,
    AITOOLS_UNINSTALL,
    AITOOLS_UPDATE,
} from "../../features/ai-tools/telemetry";
import { BUNDLE_RUN } from "../../features/bundle-explorer/telemetry";
import { BUNDLE_INIT } from "../../features/bundle-init/telemetry";
import { COMPUTE_SELECTED } from "../../features/compute/telemetry";
import {
    AUTO_LOGIN,
    CONNECTION_STATE_CHANGED,
    MANUAL_LOGIN,
} from "../../features/connection/telemetry";
import { BUNDLE_SUB_PROJECTS, EXTENSION_INITIALIZATION } from "../../features/project/telemetry";
import {
    DBCONNECT_RUN,
    PYTHON_ENV_ADOPTION,
    PYTHON_ENV_DBCONNECT_INSTALL,
    PYTHON_ENV_DRIFT,
    PYTHON_ENV_MANUAL_SETUP_OPTOUT,
    PYTHON_ENV_SETUP_ATTEMPT,
    PYTHON_ENV_SETUP_DETECTED,
    PYTHON_ENV_SETUP_RESULT,
} from "../../features/python/telemetry";
import { WORKFLOW_RUN } from "../../features/run/telemetry";
import { OPEN_RESOURCE_EXTERNALLY } from "../../features/tree-commands/telemetry";
import {
    metadataDefinitions,
    type MetadataTypes,
    type TelemetryEvent,
} from "../../kernel/telemetry/definitions";
import {
    COMMAND_EXECUTION,
    CORE_EVENTS,
    EXTENSION_ACTIVATION,
} from "../../kernel/telemetry/events";
import {
    OLD_EVENT_PROPERTIES,
    OLD_METADATA_PROPERTIES,
    type OldEvents,
    type OldMetadata,
} from "./oldTelemetry";

/** Old events the rewrite no longer sends, with the reason. */
const REMOVED_EVENTS: Partial<Record<keyof OldEvents, string>> = {
    autoMigration: "Recorded the project.json migration, which is dropped.",
    manualMigration: "Recorded the project.json migration, which is dropped.",
    bundleTerraformEngineWarning: "The Terraform-engine warning isn't ported (BNDL-14).",
};

/** The rewrite's declaration of each old event that it still sends. */
const EVENTS = {
    "commandExecution": COMMAND_EXECUTION,
    "extensionActivation": EXTENSION_ACTIVATION,
    "extensionInitialization": EXTENSION_INITIALIZATION,
    "autoLogin": AUTO_LOGIN,
    "manualLogin": MANUAL_LOGIN,
    "bundleRun": BUNDLE_RUN,
    "bundleInit": BUNDLE_INIT,
    "bundleSubProjects": BUNDLE_SUB_PROJECTS,
    "connectionStateChanged": CONNECTION_STATE_CHANGED,
    "computeSelected": COMPUTE_SELECTED,
    "workflowRun": WORKFLOW_RUN,
    "dbconnectRun": DBCONNECT_RUN,
    "openResourceExternally": OPEN_RESOURCE_EXTERNALLY,
    "aitoolsInstall": AITOOLS_INSTALL,
    "aitoolsUpdate": AITOOLS_UPDATE,
    "aitoolsUninstall": AITOOLS_UNINSTALL,
    "aitoolsCursorPluginPrompt": AITOOLS_CURSOR_PLUGIN_PROMPT,
    "python_env.setup.detected": PYTHON_ENV_SETUP_DETECTED,
    "python_env.manual_setup.optout": PYTHON_ENV_MANUAL_SETUP_OPTOUT,
    "python_env.setup.attempt": PYTHON_ENV_SETUP_ATTEMPT,
    "python_env.setup.result": PYTHON_ENV_SETUP_RESULT,
    "python_env.drift": PYTHON_ENV_DRIFT,
    "python_env.adoption": PYTHON_ENV_ADOPTION,
    "python_env.dbconnect_install": PYTHON_ENV_DBCONNECT_INSTALL,
} satisfies Partial<Record<keyof OldEvents, { name: string; properties: object }>>;

type Flat<T> = { [K in keyof T]: T[K] };
type PropsOf<E> =
    E extends TelemetryEvent<infer P>
        ? P extends undefined
            ? Record<string, never>
            : Flat<P>
        : never;

/** The new events' property types, keyed like the old ones. */
type NewEvents = { [E in keyof typeof EVENTS]: PropsOf<(typeof EVENTS)[E]> };

describe("telemetry contract", () => {
    it("sends every old event, or lists it as removed with a reason", () => {
        const declared = [...CORE_EVENTS, ...FEATURES.flatMap((f) => f.telemetryEvents ?? [])];
        for (const name of Object.keys(OLD_EVENT_PROPERTIES)) {
            const removed = REMOVED_EVENTS[name as keyof OldEvents];
            const event = (EVENTS as Record<string, { name: string } | undefined>)[name];
            expect(removed !== undefined || event !== undefined, name).toBe(true);
            if (removed !== undefined) {
                expect(event, `${name} is listed as removed but still mapped`).toBeUndefined();
                expect(declared.map((e) => e.name)).not.toContain(name);
                continue;
            }
            expect(event!.name).toBe(name);
            expect(declared, `${name} is declared but not listed by any feature`).toContain(event);
        }
    });

    it("keeps each old event's property names", () => {
        for (const [name, event] of Object.entries(EVENTS)) {
            expect(Object.keys(event.properties).sort(), name).toEqual(
                [...OLD_EVENT_PROPERTIES[name as keyof OldEvents]].sort(),
            );
        }
    });

    it("keeps the metadata's property names, adding only flavor", () => {
        expect(Object.keys(metadataDefinitions.user).sort()).toEqual(
            [...OLD_METADATA_PROPERTIES.user].sort(),
        );
        expect(Object.keys(metadataDefinitions.context).sort()).toEqual(
            [...OLD_METADATA_PROPERTIES.context, "flavor"].sort(),
        );
    });

    it("keeps each old event's property types", () => {
        // Checked by the compiler, one line per event so a failure names it. A
        // new type may be narrower than the old one, never wider: every value
        // the rewrite sends is one the old extension could send.
        expectTypeOf<NewEvents["commandExecution"]>().toExtend<OldEvents["commandExecution"]>();
        expectTypeOf<NewEvents["extensionActivation"]>().toExtend<
            OldEvents["extensionActivation"]
        >();
        expectTypeOf<NewEvents["extensionInitialization"]>().toExtend<
            OldEvents["extensionInitialization"]
        >();
        expectTypeOf<NewEvents["autoLogin"]>().toExtend<OldEvents["autoLogin"]>();
        // "statusBar" is new: the status-bar menu didn't exist.
        expectTypeOf<NewEvents["manualLogin"]>().toExtend<
            Omit<OldEvents["manualLogin"], "source"> & {
                source: OldEvents["manualLogin"]["source"] | "statusBar";
            }
        >();
        expectTypeOf<NewEvents["bundleRun"]>().toExtend<OldEvents["bundleRun"]>();
        expectTypeOf<NewEvents["bundleInit"]>().toExtend<OldEvents["bundleInit"]>();
        expectTypeOf<NewEvents["bundleSubProjects"]>().toExtend<OldEvents["bundleSubProjects"]>();
        expectTypeOf<NewEvents["connectionStateChanged"]>().toExtend<
            OldEvents["connectionStateChanged"]
        >();
        expectTypeOf<NewEvents["computeSelected"]>().toExtend<OldEvents["computeSelected"]>();
        expectTypeOf<NewEvents["workflowRun"]>().toExtend<OldEvents["workflowRun"]>();
        expectTypeOf<NewEvents["dbconnectRun"]>().toExtend<OldEvents["dbconnectRun"]>();
        expectTypeOf<NewEvents["openResourceExternally"]>().toExtend<
            OldEvents["openResourceExternally"]
        >();
        expectTypeOf<NewEvents["aitoolsInstall"]>().toExtend<OldEvents["aitoolsInstall"]>();
        expectTypeOf<NewEvents["aitoolsUpdate"]>().toExtend<OldEvents["aitoolsUpdate"]>();
        expectTypeOf<NewEvents["aitoolsUninstall"]>().toExtend<OldEvents["aitoolsUninstall"]>();
        expectTypeOf<NewEvents["aitoolsCursorPluginPrompt"]>().toExtend<
            OldEvents["aitoolsCursorPluginPrompt"]
        >();
        expectTypeOf<NewEvents["python_env.setup.detected"]>().toExtend<
            OldEvents["python_env.setup.detected"]
        >();
        expectTypeOf<NewEvents["python_env.manual_setup.optout"]>().toExtend<
            OldEvents["python_env.manual_setup.optout"]
        >();
        expectTypeOf<NewEvents["python_env.setup.attempt"]>().toExtend<
            OldEvents["python_env.setup.attempt"]
        >();
        expectTypeOf<NewEvents["python_env.setup.result"]>().toExtend<
            OldEvents["python_env.setup.result"]
        >();
        expectTypeOf<NewEvents["python_env.drift"]>().toExtend<OldEvents["python_env.drift"]>();
        expectTypeOf<NewEvents["python_env.adoption"]>().toExtend<
            OldEvents["python_env.adoption"]
        >();
        expectTypeOf<NewEvents["python_env.dbconnect_install"]>().toExtend<
            OldEvents["python_env.dbconnect_install"]
        >();
        expectTypeOf<MetadataTypes["context"]>().toEqualTypeOf<
            Flat<OldMetadata["context"] & { flavor: "next" }>
        >();
        // The auth type is the CLI's name for it, which is a superset of the old SDK's.
        expectTypeOf<OldMetadata["user"]>().toExtend<MetadataTypes["user"]>();
    });
});
