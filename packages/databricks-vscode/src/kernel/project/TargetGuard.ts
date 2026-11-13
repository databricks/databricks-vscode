import { UserFacingError } from "../../platform/errors";
import { disposeAll, type Disposable } from "../../platform/event";
import type { Logger } from "../../platform/log";
import { MutableState, Resource, type State } from "../../platform/reactive";
import type { BundleFilesSnapshot } from "../bundle/BundleFiles";
import type { ConnectionState } from "../connection/ConnectionService";
import type { ProjectSnapshot } from "./ProjectService";
import {
    metadataHostOf,
    targetAccess,
    targetWorkspaceOf,
    type HostMetadata,
    type ProjectPolicy,
    type TargetAccess,
} from "./targetAccess";

/** Whether the active target's bundle commands may run here (`targetAccess`). */
export type TargetAccessState =
    /** Any target may: a local window. */
    | { readonly status: "open" }
    /** No project, or no target. */
    | { readonly status: "none" }
    /** Deciding: reading the files, waiting for the connection or asking the host. */
    | { readonly status: "checking"; readonly root: string; readonly target: string }
    | {
          readonly status: "decided";
          readonly root: string;
          readonly target: string;
          readonly access: TargetAccess;
      };

/** Why `target` of `root` may not run bundle commands in `state`, or undefined if it may. */
export function accessError(
    state: TargetAccessState,
    root: string,
    target: string,
): UserFacingError | undefined {
    if (state.status === "open") {
        return undefined;
    }
    if (state.status === "decided" && state.root === root && state.target === target) {
        return state.access.usable
            ? undefined
            : new UserFacingError("TARGET_PAUSED", `${state.access.reason} ${state.access.remedy}`);
    }
    return new UserFacingError(
        "TARGET_PAUSED",
        `Bundle commands for target "${target}" wait until this session window has checked that it deploys to the session's workspace.`,
    );
}

export interface TargetGuardDeps {
    readonly policy: ProjectPolicy;
    readonly project: State<ProjectSnapshot>;
    readonly connection: State<ConnectionState>;
    /** The bundle's files, read again from disk for each decision. */
    readonly readFiles: (root: string) => Promise<BundleFilesSnapshot>;
    readonly metadata: (host: string, signal: AbortSignal) => Promise<HostMetadata | undefined>;
    /** Host → workspace IDs local windows saw it serve (`WorkspaceIdRecorder`). */
    readonly recorded: () => ReadonlyMap<string, readonly string[]>;
    readonly log: Logger;
}

/**
 * Decides, for a session window, whether the active target is in the
 * session's workspace, so that its bundle commands may send the session's
 * token. It decides again when the project, the target, a bundle file or
 * the connection changes. In a local window every target is open.
 */
export class TargetGuard implements Disposable {
    private readonly decision?: Resource<TargetAccessState>;
    private readonly current = new MutableState<TargetAccessState>({ status: "none" });
    readonly state: State<TargetAccessState> = this.current;
    private readonly disposables: Disposable[] = [];
    private inputs?: string;

    constructor(private readonly deps: TargetGuardDeps) {
        if (deps.policy.kind === "anyTarget") {
            this.current.set({ status: "open" });
            return;
        }
        const decision = new Resource((signal) => this.decide(signal));
        this.decision = decision;
        this.disposables.push(
            decision,
            decision.onDidChange((s) => {
                if (s.status === "ready") {
                    this.current.set(s.value);
                } else if (s.status === "error") {
                    deps.log.error("The target guard failed", s.error);
                    const { root, target } = this.active() ?? {};
                    this.current.set(
                        root === undefined || target === undefined
                            ? { status: "none" }
                            : {
                                  status: "decided",
                                  root,
                                  target,
                                  access: {
                                      usable: false,
                                      reason: `Bundle commands for target "${target}" are paused in this session window: ${s.error.message}.`,
                                      remedy: "Work on the project from a local window.",
                                  },
                              },
                    );
                }
            }),
        );
    }

    /** Starts following the project and the connection. Call from `start`. */
    start(): void {
        if (this.decision === undefined) {
            return;
        }
        this.disposables.push(
            this.deps.project.onDidChange(() => this.update()),
            this.deps.connection.onDidChange(() => this.update()),
        );
        this.update();
    }

    /**
     * Throws unless the active target's bundle commands may run: the last
     * line of defence, right where the session's token joins a bundle call.
     */
    assertUsable(root: string, target: string): void {
        const error = accessError(this.current.value, root, target);
        if (error !== undefined) {
            throw error;
        }
    }

    /**
     * Decides `target` of `root` from the files on disk right now, and throws
     * unless it may run. Called right before each bundle command that sends
     * the session's token, so a host edited a moment ago is seen without
     * waiting for the project's debounce. The cached decision still applies.
     */
    async assertUsableNow(root: string, target: string): Promise<void> {
        // A local window: every target is open, and nothing is read.
        if (this.decision === undefined) {
            return;
        }
        const state = await this.decideAt({ root, target }, new AbortController().signal);
        const error = accessError(state, root, target);
        if (error !== undefined) {
            throw error;
        }
    }

    private active(): { root: string; target: string } | undefined {
        const { project, target } = this.deps.project.value;
        return project === undefined || target === undefined
            ? undefined
            : { root: project.root, target };
    }

    private update() {
        const active = this.active();
        const connection = this.deps.connection.value;
        const workspaceId =
            connection.status === "connected" ? connection.connection.workspaceId : undefined;
        const next = JSON.stringify([
            active,
            this.deps.project.value.revision,
            connection.status,
            workspaceId,
        ]);
        if (next === this.inputs) {
            return;
        }
        this.inputs = next;
        if (active === undefined) {
            this.decision?.reset();
            this.current.set({ status: "none" });
            return;
        }
        this.current.set({ status: "checking", ...active });
        this.decision?.invalidate("inputs changed");
    }

    private async decide(signal: AbortSignal): Promise<TargetAccessState> {
        const active = this.active();
        return active === undefined ? { status: "none" } : this.decideAt(active, signal);
    }

    private async decideAt(
        active: { root: string; target: string },
        signal: AbortSignal,
    ): Promise<TargetAccessState> {
        if (this.deps.policy.kind !== "sessionWorkspace") {
            return { status: "none" };
        }
        const connection = this.deps.connection.value;
        if (connection.status !== "connected") {
            // The session's workspace ID comes with its connection.
            return { status: "checking", ...active };
        }
        const session = {
            host: this.deps.policy.host,
            workspaceId: connection.connection.workspaceId,
        };
        const workspace = targetWorkspaceOf(await this.deps.readFiles(active.root), active.target);
        signal.throwIfAborted();
        const asked = metadataHostOf(workspace, session);
        const metadata = asked === undefined ? undefined : await this.deps.metadata(asked, signal);
        const access = targetAccess(
            active.target,
            workspace,
            session,
            metadata,
            this.deps.recorded(),
        );
        if (!access.usable) {
            this.deps.log.info(`${access.reason} ${access.remedy}`);
        }
        return { status: "decided", ...active, access };
    }

    dispose(): void {
        disposeAll(this.disposables);
        this.current.dispose();
    }
}
