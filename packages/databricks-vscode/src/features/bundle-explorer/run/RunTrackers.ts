import type { Disposable, Event } from "vscode";
import { Emitter } from "../../../platform/event";
import type { JobRunTracker } from "./JobRunTracker";
import type { PipelineRunTracker } from "./PipelineRunTracker";

export type AnyRunTracker = JobRunTracker | PipelineRunTracker;

/**
 * The runs of the project session (the old `BundleRunStatusManager`): the
 * latest run of each resource, keyed `jobs.<key>` or `pipelines.<key>`, and
 * every pipeline update of the session, which the Datasets rows mine. The
 * feature clears it when the session ends, which stops every tracker.
 */
export class RunTrackers implements Disposable {
    private readonly latest = new Map<string, AnyRunTracker>();
    private readonly pipelineRuns = new Map<string, PipelineRunTracker[]>();
    private readonly subscriptions = new Map<AnyRunTracker, Disposable>();
    private readonly changed = new Emitter<string | undefined>();
    /**
     * A resource key when only that run's status changed, as on each poll; undefined when a run
     * started, ended, or was dropped, which can change more than its own rows.
     */
    readonly onDidChange: Event<string | undefined> = this.changed.event;

    get(resourceKey: string): AnyRunTracker | undefined {
        return this.latest.get(resourceKey);
    }

    isRunning(resourceKey: string): boolean {
        return this.latest.get(resourceKey)?.isRunning ?? false;
    }

    /** Every update of the pipeline in this session, oldest first. */
    pipelineHistory(resourceKey: string): readonly PipelineRunTracker[] {
        return this.pipelineRuns.get(resourceKey) ?? [];
    }

    /** Every resource's latest run. */
    all(): AnyRunTracker[] {
        return [...this.latest.values()];
    }

    /** Makes `tracker` the resource's latest run. */
    add(resourceKey: string, tracker: AnyRunTracker): void {
        this.latest.set(resourceKey, tracker);
        if (tracker.type === "pipelines") {
            this.pipelineRuns.set(resourceKey, [...this.pipelineHistory(resourceKey), tracker]);
        }
        let state = tracker.state;
        this.subscriptions.set(
            tracker,
            tracker.onDidChange(() => {
                const same = tracker.state === state;
                state = tracker.state;
                this.changed.fire(same ? resourceKey : undefined);
            }),
        );
        this.changed.fire(undefined);
    }

    /** Stops and forgets every run. */
    clear(): void {
        const trackers = new Set([
            ...this.latest.values(),
            ...[...this.pipelineRuns.values()].flat(),
        ]);
        if (trackers.size === 0) {
            return;
        }
        for (const tracker of trackers) {
            this.subscriptions.get(tracker)?.dispose();
            tracker.dispose();
        }
        this.subscriptions.clear();
        this.latest.clear();
        this.pipelineRuns.clear();
        this.changed.fire(undefined);
    }

    dispose(): void {
        this.clear();
        this.changed.dispose();
    }
}
