import {Disposable, Event, EventEmitter} from "vscode";
import {AiToolsScope} from "../cli/CliWrapper";

/** Where AI tools are installed, or undefined if not installed. */
export type AiToolsInstallLocation = AiToolsScope | undefined;

/** The status of the update check. */
export type AiToolsUpdateStatus =
    | "unknown"
    | "checking"
    | "updating"
    | "upToDate"
    | "updateAvailable"
    | "error";

export interface AiToolsAgentStatus {
    displayName: string;
    id: string;
    type: "plugin" | "skills-only";
    detected: boolean;
    /**
     * Whether the agent can be installed at project scope. Agents that only
     * support global scope (e.g. Cursor, Codex CLI) report `false`; the install
     * picker disables them when the chosen scope is `project`.
     */
    supportsProjectScope: boolean;
    version?: string;
    /**
     * True when a managed agent received only the raw skills rather than the
     * managed plugin (`managed === true && installed.delivery === "skills"`).
     * The row annotates its version with "skills only" in this case.
     */
    skillsOnly?: boolean;
}

export type AgentInstallBlockReason = "notDetected" | "scopeUnsupported";

/**
 * Why an agent can't be installed at `scope`, or undefined if it can. Shared by
 * the install picker ({@link AiToolsAgentStatus} in AiToolsCommands) and the
 * Agents tree so both surfaces stay in lockstep. `supportsProjectScope` only
 * gates the `project` scope; not-detected is checked first.
 */
export function agentInstallBlockReason(
    agent: AiToolsAgentStatus,
    scope: AiToolsScope
): AgentInstallBlockReason | undefined {
    if (!agent.detected) {
        return "notDetected";
    }
    if (scope === "project" && !agent.supportsProjectScope) {
        return "scopeUnsupported";
    }
    return undefined;
}

export interface AiToolsState {
    installLocation: AiToolsInstallLocation;
    updateStatus: AiToolsUpdateStatus;
    /** The installed AI tools release version, if known. */
    version?: string;
    /**
     * True when the last install detection failed with an unexpected error
     * (e.g. a permission/IO error reading the state file) rather than the state
     * file simply being absent. Distinguishes "genuinely not installed" from
     * "couldn't determine install state".
     */
    detectError?: boolean;
    agents: AiToolsAgentStatus[];
}

/**
 * Holds the observable AI tools state and notifies listeners when it changes.
 *
 * This is a pull model: the {@link AiToolsManager} owns all the logic and pushes
 * state in via {@link update}, while clients (the tree component) listen to
 * {@link onDidChange} and read the current snapshot from {@link state}. Keeping
 * the state + notification here leaves the manager to focus purely on detecting
 * and mutating the install.
 */
export class AiToolsModel implements Disposable {
    private _onDidChange: EventEmitter<void> = new EventEmitter<void>();
    readonly onDidChange: Event<void> = this._onDidChange.event;

    private _state: AiToolsState;

    constructor(installLocation: AiToolsInstallLocation) {
        this._state = {
            installLocation,
            updateStatus: "unknown",
            version: undefined,
            detectError: false,
            agents: [],
        };
    }

    /** A snapshot of the current state. */
    get state(): AiToolsState {
        return {...this._state};
    }

    get isInstalled(): boolean {
        return this._state.installLocation !== undefined;
    }

    /** The resolved install scope, or undefined when not installed. */
    get installLocation(): AiToolsInstallLocation {
        return this._state.installLocation;
    }

    /**
     * Merge a partial state patch and notify listeners. Every mutation of the
     * AI tools state flows through here, so a single {@link onDidChange} fires
     * per logical change.
     */
    update(patch: Partial<AiToolsState>): void {
        this._state = {...this._state, ...patch};
        this._onDidChange.fire();
    }

    dispose() {
        this._onDidChange.dispose();
    }
}
