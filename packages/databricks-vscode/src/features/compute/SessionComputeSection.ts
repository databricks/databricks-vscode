import { ThemeIcon } from "vscode";
import type { ClusterDetails } from "../../kernel/compute/clusters";
import type { SessionCompute } from "../../kernel/host/Host";
import type { Event } from "../../platform/event";
import {
    SIGN_IN_SECTION_ORDER,
    type ConfigurationItem,
    type ConfigurationSection,
} from "../../platform/ui/sections";

export interface SessionComputeInputs {
    readonly session: SessionCompute;
    /** The connected workspace's host, for the cluster's page; undefined while signed out. */
    readonly host: () => string | undefined;
    /** The session's cluster, once read. */
    readonly details: () => ClusterDetails | undefined;
}

/** The row for the compute a session window runs on: none while signed out, as the workspace's row. */
function sessionComputeRows(inputs: SessionComputeInputs): ConfigurationItem[] {
    const host = inputs.host();
    if (host === undefined) {
        return [];
    }
    const { session } = inputs;
    const runtime = session.runtimeVersion !== undefined ? ` (${session.runtimeVersion})` : "";
    if (session.kind === "serverless") {
        return [
            {
                label: "Session compute",
                description: "Serverless",
                tooltip: `This window runs on serverless compute${runtime}.`,
                iconPath: new ThemeIcon("server-environment"),
            },
        ];
    }
    const name = inputs.details()?.name;
    return [
        {
            label: "Session compute",
            description: name ?? session.clusterId,
            tooltip: `This window runs on cluster ${name ?? session.clusterId}${runtime}, ID ${session.clusterId}. Stopping it ends the session.`,
            iconPath: new ThemeIcon("server-environment"),
            // The rows' "Open link" action.
            contextValue: "databricks.session.compute.has-url",
            url: `${host.replace(/\/+$/, "")}/compute/clusters/${session.clusterId}`,
        },
    ];
}

/** "Session compute" in the Sign-in view, in a session window. */
export class SessionComputeSection implements ConfigurationSection {
    readonly id = "compute.session";
    readonly view = "signIn";
    readonly order = SIGN_IN_SECTION_ORDER.sessionCompute;

    constructor(
        private readonly inputs: SessionComputeInputs,
        readonly onDidChange: Event<void>,
    ) {}

    getChildren(parent?: ConfigurationItem): ConfigurationItem[] {
        return parent === undefined ? sessionComputeRows(this.inputs) : [];
    }
}
