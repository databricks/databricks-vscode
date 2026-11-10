import type { Event } from "vscode";
import { stateKey, type StateStore } from "../../../../platform/state";

/** What a successful setup leaves behind, for readiness and drift detection. */
export interface PythonSetupState {
    /** The environment key the `.venv` was provisioned against, e.g. `serverless/serverless-v4`. */
    readonly envKey: string;
    readonly pythonVersion: string;
    /** When the setup finished, as an ISO string. */
    readonly timestamp: string;
}

/** The old key: one value per window, whichever project was set up last. Read, never written. */
export const LEGACY_SETUP_STATE = stateKey<PythonSetupState | undefined>(
    "databricks.pythonSetup.setupState",
    "workspace",
    undefined,
);

/** The setup of each project, by root. */
export const SETUP_STATES = stateKey<Record<string, PythonSetupState> | undefined>(
    "databricks.python.setupStates",
    "workspace",
    undefined,
);

/**
 * The uv setup recorded for each project (PYENV-04). The old extension kept
 * a single value per window, so a sibling project's setup read as this
 * one's; it is copied into the first project read in a window with at most
 * one folder, where it can only have been that project's.
 */
export class SetupStates {
    /** The project the old value was read for: the first write keeps it there. */
    private legacyRoot?: string;

    constructor(
        private readonly state: StateStore,
        /** How many workspace folders are open: the old value can be attributed only when there is one. */
        private readonly folderCount: () => number,
    ) {}

    get onDidChange(): Event<void> {
        return this.state.onDidChange(SETUP_STATES);
    }

    get(root: string): PythonSetupState | undefined {
        const all = this.state.get(SETUP_STATES);
        if (all !== undefined) {
            return all[root];
        }
        // Not migrated yet: the old value stands for the only project there can be.
        const legacy = this.folderCount() <= 1 ? this.state.get(LEGACY_SETUP_STATE) : undefined;
        if (legacy !== undefined) {
            this.legacyRoot ??= root;
        }
        return legacy;
    }

    async set(root: string, value: PythonSetupState): Promise<void> {
        await this.state.set(SETUP_STATES, { ...this.seed(root), [root]: value });
    }

    /** The first write copies the old value for the project it was first read for, unless that write replaces it. */
    private seed(root: string): Record<string, PythonSetupState> {
        const all = this.state.get(SETUP_STATES);
        if (all !== undefined) {
            return all;
        }
        const legacy = this.folderCount() <= 1 ? this.state.get(LEGACY_SETUP_STATE) : undefined;
        return legacy === undefined ? {} : { [this.legacyRoot ?? root]: legacy };
    }
}
